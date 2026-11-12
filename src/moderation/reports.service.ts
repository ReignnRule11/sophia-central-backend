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

    const report = await this.reports.save(this.reports.create({
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
      const moderators = await this.users.find({ where: { role: In([UserRole.MODERATOR, UserRole.ADMIN]), isSuspended: false } });
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
      select: ['id', 'targetType', 'targetLabel', 'reason', 'details', 'status', 'moderatorNote', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async listForModeration(status?: ContentReportStatus) {
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
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(moderator.role) || moderator.isSuspended) {
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
          `Your report about ${report.targetLabel} is now ${dto.status.replace(/_/g, ' ')}.`,
          '/reports',
        );
      } catch (error) {
        this.logger.warn(`Report ${report.id} was updated but reporter notification failed: ${String(error)}`);
      }
    }
    return saved;
  }
}
