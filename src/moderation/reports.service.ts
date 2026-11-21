import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { ChatKind, ChatMessage } from '../chat/entities/chat-message.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateContentReportDto } from './dto/create-content-report.dto';
import { UpdateContentReportDto } from './dto/update-content-report.dto';
import { ContentReport, ContentReportStatus, ReportTargetType } from './entities/content-report.entity';

@Injectable()
export class ContentReportsService {
  private readonly logger = new Logger(ContentReportsService.name);

  constructor(
    @InjectRepository(ContentReport) private readonly reports: Repository<ContentReport>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    private readonly notifications: NotificationsService,
  ) {}

  private assertReporter(user: User) {
    if (user.isSuspended || ![UserRole.STUDENT, UserRole.LECTURER].includes(user.role)) {
      throw new ForbiddenException('Only active student and lecturer accounts can submit reports.');
    }
  }

  private groupRoomKey(user: User) {
    if (!user.institution || !user.faculty || !user.department) {
      throw new ForbiddenException('Complete your academic profile before reporting a group-chat message.');
    }
    return 'group:' + [user.institution, user.faculty, user.department].map(value => value.trim().toLowerCase()).join(':');
  }

  private async resolveTarget(reporter: User, dto: CreateContentReportDto) {
    if (dto.targetType === ReportTargetType.USER) {
      if (dto.targetId === reporter.id) throw new BadRequestException('You cannot report your own account.');
      const target = await this.users.findOne({ where: { id: dto.targetId } });
      if (!target || ![UserRole.STUDENT, UserRole.LECTURER].includes(target.role)) {
        throw new NotFoundException('The student or lecturer account could not be found.');
      }
      return {
        targetOwnerId: target.id,
        targetLabel: [target.firstName, target.lastName].filter(Boolean).join(' ') || target.academicHandle || 'Academic account',
        targetSnapshot: {
          id: target.id, role: target.role, firstName: target.firstName ?? null,
          lastName: target.lastName ?? null, academicHandle: target.academicHandle ?? null,
          institution: target.institution ?? null,
        },
      };
    }

    if (dto.targetType === ReportTargetType.RESOURCE) {
      const target = await this.resources.findOne({ where: { id: dto.targetId }, relations: ['uploader'] });
      if (!target || target.moderationStatus !== ResourceModerationStatus.APPROVED) {
        throw new NotFoundException('This academic resource is not available to report.');
      }
      return {
        targetOwnerId: target.uploaderId,
        targetLabel: target.title,
        targetSnapshot: {
          id: target.id, title: target.title, description: target.description ?? null,
          type: target.type, course: target.course ?? null, institution: target.institution ?? null,
          uploaderId: target.uploaderId,
          uploaderHandle: target.uploader?.academicHandle ?? null,
        },
      };
    }

    const message = await this.messages.findOne({ where: { id: dto.targetId } });
    if (!message || message.isDeleted || !message.senderId) {
      throw new NotFoundException('This chat message is no longer available to report.');
    }
    if (message.senderId === reporter.id) throw new BadRequestException('You cannot report your own message.');
    if (message.kind === ChatKind.GROUP) {
      if (reporter.role !== UserRole.STUDENT || this.groupRoomKey(reporter) !== message.roomKey) {
        throw new ForbiddenException('You can report only messages in your own academic group.');
      }
    } else if (!message.roomKey.split(':').includes(reporter.id)) {
      throw new ForbiddenException('You can report only messages from a conversation you belong to.');
    }
    const sender = await this.users.findOne({ where: { id: message.senderId } });
    return {
      targetOwnerId: message.senderId,
      targetLabel: message.contentType === 'voice' ? 'Voice message' : message.contentType === 'sticker' ? 'Sticker message' : 'Chat message',
      targetSnapshot: {
        id: message.id, kind: message.kind, roomKey: message.roomKey,
        senderId: message.senderId, senderHandle: message.senderHandle,
        contentType: message.contentType,
        text: message.contentType === 'text' ? (message.text ?? '').slice(0, 2000) : null,
        stickerId: message.stickerId ?? null, createdAt: message.createdAt,
        senderRole: sender?.role ?? null,
      },
    };
  }

  async create(reporter: User, dto: CreateContentReportDto) {
    this.assertReporter(reporter);
    const target = await this.resolveTarget(reporter, dto);
    const duplicate = await this.reports.findOne({
      where: {
        reporterId: reporter.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: In([ContentReportStatus.PENDING, ContentReportStatus.REVIEWING]),
      },
    });
    if (duplicate) throw new ConflictException('You already have an open report for this item.');

    const ticketSequence = await this.reports.query("SELECT nextval('sophis_report_ticket_seq') AS value");
    const ticketNumber = `RPT-${new Date().getFullYear()}-${String(Number(ticketSequence[0].value)).padStart(6, '0')}`;
    const report = await this.reports.save(this.reports.create({
      ticketNumber,
      reporterId: reporter.id,
      reporter,
      targetType: dto.targetType,
      targetId: dto.targetId,
      ...target,
      reason: dto.reason,
      details: dto.details?.trim() || null,
      status: ContentReportStatus.PENDING,
    }));

    try {
      const moderators = await this.users.find({ where: { role: UserRole.MODERATOR, isSuspended: false } });
      await Promise.all(moderators.map(moderator => this.notifications.createNotification(
        moderator.id,
        'content_report_submitted',
        'A new report needs review',
        `A ${dto.targetType.replace(/_/g, ' ')} was reported for ${dto.reason.replace(/_/g, ' ')}.`,
        '/moderation?tab=reports',
      )));
    } catch (error) {
      this.logger.warn(`Report ${report.id} was saved but moderator notifications could not be created: ${String(error)}`);
    }
    return report;
  }

  async listMine(userId: string) {
    return this.reports.find({
      where: { reporterId: userId },
      select: ['id', 'ticketNumber', 'targetType', 'targetLabel', 'targetSnapshot', 'reason', 'details', 'status', 'moderatorNote', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async escalate(id: string, actor: User, targetRole: UserRole.SUPPORT | UserRole.ADMIN, reason: string) {
    if (actor.role !== UserRole.MODERATOR || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Moderators can escalate reports.');
    if (![UserRole.SUPPORT, UserRole.ADMIN].includes(targetRole)) throw new BadRequestException('Reports may only be escalated to Support or Admin.');
    if (!reason?.trim()) throw new BadRequestException('An escalation reason is required.');
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found.');
    const recipients = await this.users.find({ where: { role: targetRole, isSuspended: false } });
    if (!recipients.length) throw new BadRequestException('No active recipient account is configured for this escalation.');
    await Promise.all(recipients.map(recipient => this.notifications.createNotification(recipient.id, 'moderation_report_escalated', 'Moderation report escalated', `Report ${report.ticketNumber} (${report.targetType}: ${report.targetLabel}) was escalated by the Moderator. Reason: ${report.reason}. Details: ${(report.details || JSON.stringify(report.targetSnapshot)).slice(0, 900)}. Escalation reason: ${reason.trim()}`, '/notifications')));
    return { success: true, ticketNumber: report.ticketNumber, notified: recipients.length };
  }

  async listForModeration(actor: User, status?: ContentReportStatus) {
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(actor.role) || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active moderators and administrators can access reports.');
    const allowed = Object.values(ContentReportStatus);
    if (status && !allowed.includes(status)) throw new BadRequestException('Invalid report status filter.');
    return this.reports.find({
      ...(status ? { where: { status } } : {}),
      relations: ['reporter', 'assignedModerator'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async update(id: string, moderator: User, dto: UpdateContentReportDto) {
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(moderator.role) || moderator.isSuspended || moderator.accountStatus !== 'active' || moderator.emailVerified !== true) {
      throw new ForbiddenException('Only active moderators and administrators can process reports.');
    }
    const report = await this.reports.findOne({ where: { id }, relations: ['reporter'] });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.status === ContentReportStatus.ACTIONED || report.status === ContentReportStatus.DISMISSED) {
      throw new ConflictException('This report has already been closed.');
    }
    if ([ContentReportStatus.ACTIONED, ContentReportStatus.DISMISSED].includes(dto.status) && !dto.moderatorNote?.trim()) {
      throw new BadRequestException('Add a moderator note before closing this report.');
    }
    report.status = dto.status;
    report.assignedModeratorId = moderator.id;
    report.moderatorNote = dto.moderatorNote?.trim() || report.moderatorNote || null;
    const saved = await this.reports.save(report);
    if (report.reporterId) {
      try {
        await this.notifications.createNotification(
          report.reporterId,
          'content_report_updated',
          'Your report has been updated',
          `Ticket ${report.ticketNumber} is now ${dto.status.replace(/_/g, ' ')}. Open My Activity for the full update.`,
          '/my-activity',
        );
      } catch (error) {
        this.logger.warn(`Report ${report.id} was updated but reporter notification failed: ${String(error)}`);
      }
    }
    return saved;
  }
}
