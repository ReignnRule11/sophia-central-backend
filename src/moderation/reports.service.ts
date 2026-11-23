import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { ChatKind, ChatMessage } from '../chat/entities/chat-message.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateContentReportDto } from './dto/create-content-report.dto';
import { UpdateContentReportDto } from './dto/update-content-report.dto';
import { ContentReport, ContentReportStatus, ReportTargetType } from './entities/content-report.entity';
import { AdminEscalationDecisionDto } from '../common/dto/admin-escalation-decision.dto';

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
        '/moderation/reports?tab=reports',
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

  async escalate(id: string, actor: User, targetRole: UserRole.ADMIN, reason: string) {
    if (actor.role !== UserRole.MODERATOR || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Moderators can escalate reports.');
    if (targetRole !== UserRole.ADMIN) throw new BadRequestException('Moderation reports may only be escalated to Admin.');
    if (!reason?.trim()) throw new BadRequestException('An escalation reason is required.');
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.escalatedToRole === 'admin') throw new ConflictException('This moderation report has already been escalated to Admin.');
    const recipients = await this.users.find({ where: { role: UserRole.ADMIN, isSuspended: false, accountStatus: 'active', emailVerified: true } });
    if (!recipients.length) throw new BadRequestException('No active Admin account is configured for this escalation.');
    report.escalatedToRole = 'admin';
    report.escalationReason = reason.trim();
    report.escalatedAt = new Date();
    report.escalatedById = actor.id;
    await this.reports.save(report);
    await this.reports.query(
      'INSERT INTO admin_escalation_events ("sourceType", "sourceId", "ticketNumber", "actorId", "actorEmail", reason) VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6)',
      ['moderation', report.id, report.ticketNumber, actor.id, actor.email, reason.trim()],
    );
    await this.reports.query(
      'INSERT INTO report_case_events ("reportId", "actorId", "actorEmail", "eventType", reason) VALUES ($1::uuid, $2::uuid, $3, $4, $5)',
      [report.id, actor.id, actor.email, 'escalated_to_admin', reason.trim()],
    );
    await Promise.all(recipients.map(recipient => this.notifications.createNotification(recipient.id, 'moderation_report_escalated', 'Moderation report escalated', `Report ${report.ticketNumber} (${report.targetType}: ${report.targetLabel}) was escalated by the Moderator. Reason: ${report.reason}. Details: ${(report.details || JSON.stringify(report.targetSnapshot)).slice(0, 900)}. Escalation reason: ${reason.trim()}`, '/admin/escalations')));
    return { success: true, ticketNumber: report.ticketNumber, notified: recipients.length };
  }

  async listAdminEscalations(actor: User) {
    if (actor.role !== UserRole.ADMIN || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only an active, verified Admin can inspect escalated moderation reports.');
    }
    const reports = await this.reports.find({
      where: { escalatedToRole: 'admin' },
      relations: ['reporter', 'assignedModerator'],
      order: { escalatedAt: 'DESC' },
      take: 100,
    });
    if (!reports.length) return [];
    const decisions = await this.reports.query(
      `SELECT "sourceId", action, note, "actorEmail", "createdAt"
       FROM admin_escalation_decisions
       WHERE "sourceType" = 'moderation' AND "sourceId" = ANY($1::uuid[])
       ORDER BY "sourceId", "createdAt" DESC`,
      [reports.map(report => report.id)],
    );
    const historyById = new Map<string, any[]>();
    for (const decision of decisions as any[]) {
      const history = historyById.get(decision.sourceId) ?? [];
      history.push(decision);
      historyById.set(decision.sourceId, history);
    }
    return reports.map(report => {
      const history = historyById.get(report.id) ?? [];
      return { ...report, adminDecision: history[0] ?? null, adminDecisionHistory: history };
    });
  }

  async recordAdminEscalationDecision(id: string, actor: User, dto: AdminEscalationDecisionDto) {
    if (actor.role !== UserRole.ADMIN || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only an active, verified Admin can decide escalated moderation reports.');
    }
    const report = await this.reports.findOne({ where: { id }, relations: ['reporter', 'assignedModerator'] });
    if (!report) throw new NotFoundException('Moderation report not found.');
    if (report.escalatedToRole !== 'admin') throw new ConflictException('This report is not currently escalated to Admin.');
    const latest = await this.reports.query(
      `SELECT action FROM admin_escalation_decisions
       WHERE "sourceType" = 'moderation' AND "sourceId" = $1::uuid
       ORDER BY "createdAt" DESC LIMIT 1`,
      [id],
    );
    if (latest[0]?.action === 'resolved') throw new ConflictException('This Admin escalation has already been resolved.');
    const result = await this.reports.query(
      `INSERT INTO admin_escalation_decisions
       ("sourceType", "sourceId", "ticketNumber", action, note, "actorId", "actorEmail")
       VALUES ('moderation', $1::uuid, $2, $3, $4, $5::uuid, $6)
       RETURNING id, action, note, "actorEmail", "createdAt"`,
      [report.id, report.ticketNumber, dto.action, dto.note.trim(), actor.id, actor.email],
    );
    try {
      if (dto.action === 'awaiting_information' && report.reporterId) {
        await this.notifications.createNotification(report.reporterId, 'content_report_updated', 'More information requested', `Admin requested more information for report ${report.ticketNumber}: ${dto.note.trim()}`, '/my-activity');
      } else if (dto.action === 'resolved') {
        if (report.reporterId) await this.notifications.createNotification(report.reporterId, 'content_report_updated', 'Admin escalation review completed', `Admin completed the escalation review for report ${report.ticketNumber}: ${dto.note.trim()}`, '/my-activity');
        const moderators = report.assignedModerator
          ? [report.assignedModerator]
          : await this.users.find({ where: { role: UserRole.MODERATOR, isSuspended: false, accountStatus: 'active', emailVerified: true } });
        await Promise.all(moderators.map(account => this.notifications.createNotification(account.id, 'moderation_escalation_resolved', 'Admin completed an escalation review', `Admin recorded a final escalation decision for report ${report.ticketNumber}. Review the decision in the Admin escalation centre.`, '/moderation?tab=reports')));
      } else if (dto.action === 'returned_to_team') {
        // Clear active escalation state so the Moderator team can resume the case.
        report.escalatedToRole = null;
        report.escalationReason = null;
        report.escalatedAt = null;
        report.escalatedById = null;
        await this.reports.save(report);
        await this.reports.query(
          'INSERT INTO report_case_events ("reportId", "actorId", "actorEmail", "eventType", reason) VALUES ($1::uuid, $2::uuid, $3, $4, $5)',
          [report.id, actor.id, actor.email, 'returned_from_admin', dto.note.trim()],
        );
        const recipients = report.assignedModerator
          ? [report.assignedModerator]
          : await this.users.find({ where: { role: UserRole.MODERATOR, isSuspended: false, accountStatus: 'active', emailVerified: true } });
        await Promise.all(recipients.map(account => this.notifications.createNotification(account.id, 'moderation_escalation_returned', 'Admin returned an escalated report', `Report ${report.ticketNumber} was returned to Moderation: ${dto.note.trim()}`, '/moderation/reports?tab=reports')));
      }
    } catch (error) {
      this.logger.warn(`Admin decision for moderation report ${report.ticketNumber} was saved but notification delivery failed: ${String(error)}`);
    }
    return result[0];
  }

  async assignReport(id: string, actor: User, moderatorId: string | undefined, reason: string) {
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(actor.role) || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only active, verified Moderators and Admins can assign reports.');
    }
    if (!reason?.trim()) throw new BadRequestException('An assignment reason is required.');
    const targetModeratorId = moderatorId || actor.id;
    if (actor.role === UserRole.MODERATOR && targetModeratorId !== actor.id) {
      throw new ForbiddenException('Moderators may claim unassigned reports or reassign their own cases only to themselves. Admin can assign cases to other Moderators.');
    }
    const result = await this.reports.manager.transaction(async manager => {
      const report = await manager.findOne(ContentReport, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!report) throw new NotFoundException('Report not found.');
      if (report.escalatedToRole === 'admin') throw new ConflictException('This report is currently with Admin.');
      if ([ContentReportStatus.ACTIONED, ContentReportStatus.DISMISSED].includes(report.status)) {
        throw new ConflictException('Closed reports cannot be assigned.');
      }
      if (actor.role === UserRole.MODERATOR && report.assignedModeratorId && report.assignedModeratorId !== actor.id) {
        throw new ForbiddenException('This report is already assigned to another Moderator.');
      }
      const target = await manager.findOne(User, { where: { id: targetModeratorId }, lock: { mode: 'pessimistic_read' } });
      if (!target || target.role !== UserRole.MODERATOR || target.isSuspended || target.accountStatus !== 'active' || target.emailVerified !== true) {
        throw new BadRequestException('Choose an active, verified Moderator account.');
      }
      const previousModeratorId = report.assignedModeratorId || null;
      if (previousModeratorId === targetModeratorId) throw new ConflictException('This report is already assigned to that Moderator.');
      const eventType = previousModeratorId ? 'reassigned' : (targetModeratorId === actor.id ? 'claimed' : 'assigned');
      report.assignedModeratorId = targetModeratorId;
      if (report.status === ContentReportStatus.PENDING) report.status = ContentReportStatus.REVIEWING;
      const saved = await manager.save(ContentReport, report);
      await manager.query(
        'INSERT INTO report_case_events ("reportId", "actorId", "actorEmail", "eventType", "fromModeratorId", "toModeratorId", reason) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7)',
        [report.id, actor.id, actor.email, eventType, previousModeratorId, targetModeratorId, reason.trim()],
      );
      return saved;
    });
    try {
      await this.notifications.createNotification(
        targetModeratorId,
        'moderation_report_assigned',
        'A report case was assigned to you',
        `Report ${result.ticketNumber} is now assigned to your Moderator workspace. Reason: ${reason.trim()}`,
        '/moderation/reports?tab=reports',
      );
    } catch (error) {
      this.logger.warn(`Report ${result.ticketNumber} was assigned but the Moderator notification could not be created: ${String(error)}`);
    }
    return result;
  }

  async getCaseHistory(id: string, actor: User) {
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(actor.role) || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only active, verified Moderators and Admins can inspect report case history.');
    }
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found.');
    if (actor.role === UserRole.MODERATOR && report.escalatedToRole === 'admin') {
      // Moderators may inspect the case history but cannot mutate an Admin-owned case.
    }
    return this.reports.query(
      'SELECT id, "actorEmail", "eventType", "fromModeratorId", "toModeratorId", "fromSeverity", "toSeverity", reason, "createdAt" FROM report_case_events WHERE "reportId" = $1::uuid ORDER BY "createdAt" ASC',
      [id],
    );
  }

  async setSeverity(id: string, actor: User, severity: string, reason: string) {
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(actor.role) || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only active, verified Moderators and Admins can prioritise reports.');
    }
    if (!['low', 'normal', 'high', 'critical'].includes(severity)) throw new BadRequestException('Choose a valid report severity.');
    if (!reason?.trim()) throw new BadRequestException('A reason is required when changing report severity.');
    return this.reports.manager.transaction(async manager => {
      const report = await manager.findOne(ContentReport, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!report) throw new NotFoundException('Report not found.');
      if (actor.role === UserRole.MODERATOR && report.escalatedToRole === 'admin') throw new ForbiddenException('This report is currently with Admin.');
      if (actor.role === UserRole.MODERATOR && report.assignedModeratorId !== actor.id) throw new ForbiddenException('Claim this report before changing its priority.');
      if ([ContentReportStatus.ACTIONED, ContentReportStatus.DISMISSED].includes(report.status)) throw new ConflictException('Closed reports cannot be reprioritised.');
      const previousSeverity = report.severity;
      report.severity = severity as any;
      const saved = await manager.save(ContentReport, report);
      await manager.query(
        'INSERT INTO report_case_events ("reportId", "actorId", "actorEmail", "eventType", "fromSeverity", "toSeverity", reason) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)',
        [id, actor.id, actor.email, 'severity_changed', previousSeverity, severity, reason.trim()],
      );
      return saved;
    });
  }

  async listForModeration(actor: User, status?: ContentReportStatus, filters: { assignedToMe?: boolean; unassigned?: boolean; severity?: string } = {}) {
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(actor.role) || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active moderators and administrators can access reports.');
    const allowed = Object.values(ContentReportStatus);
    if (status && !allowed.includes(status)) throw new BadRequestException('Invalid report status filter.');
    if (filters.severity && !['low', 'normal', 'high', 'critical'].includes(filters.severity)) throw new BadRequestException('Invalid report severity filter.');
    const where: any = {};
    if (status) where.status = status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.unassigned) where.assignedModeratorId = IsNull();
    else if (filters.assignedToMe && actor.role === UserRole.MODERATOR) where.assignedModeratorId = actor.id;
    return this.reports.find({
      where,
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
    if (moderator.role === UserRole.MODERATOR && report.escalatedToRole === 'admin') {
      throw new ForbiddenException('This report is with Admin and cannot be changed by a Moderator.');
    }
    if (moderator.role === UserRole.MODERATOR && report.assignedModeratorId !== moderator.id) {
      throw new ForbiddenException('Claim this report before processing it. Reports assigned to another Moderator cannot be changed by you.');
    }
    if (report.status === ContentReportStatus.ACTIONED || report.status === ContentReportStatus.DISMISSED) {
      throw new ConflictException('This report has already been closed.');
    }
    if ([ContentReportStatus.ACTIONED, ContentReportStatus.DISMISSED].includes(dto.status) && !dto.moderatorNote?.trim()) {
      throw new BadRequestException('Add a moderator note before closing this report.');
    }
    const previousStatus = report.status;
    report.status = dto.status;
    report.assignedModeratorId = moderator.id;
    report.moderatorNote = dto.moderatorNote?.trim() || report.moderatorNote || null;
    const saved = await this.reports.save(report);
    await this.reports.query(
      'INSERT INTO report_case_events ("reportId", "actorId", "actorEmail", "eventType", reason) VALUES ($1::uuid, $2::uuid, $3, $4, $5)',
      [id, moderator.id, moderator.email, 'status_changed', dto.moderatorNote?.trim() || `Status changed from ${previousStatus} to ${dto.status}.`],
    );
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
