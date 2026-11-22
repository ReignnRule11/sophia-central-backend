import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportRequest } from './entities/support-request.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { ConcludeSupportRequestDto } from './dto/conclude-support-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { S3Service } from '../upload/s3.service';
import { SupportEmailService } from './support-email.service';
import { AdminEscalationDecisionDto } from '../common/dto/admin-escalation-decision.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportRequest) private readonly requests: Repository<SupportRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly s3: S3Service,
    private readonly supportEmail: SupportEmailService,
  ) {}

  async create(user: User, dto: CreateSupportRequestDto) {
    if (![UserRole.STUDENT, UserRole.LECTURER].includes(user.role)) {
      throw new ForbiddenException('Only student and lecturer accounts can contact support');
    }
    const attachments = await this.validateOwnedAttachments(user.id, dto.attachments ?? []);
    const request = this.requests.create({
      userId: user.id,
      subject: dto.subject.trim(),
      category: dto.category,
      description: dto.description.trim(),
      links: (dto.links ?? []).map((link) => link.trim()).filter(Boolean),
      attachments,
      status: 'pending',
      ticketNumber: `SUP-${new Date().getFullYear()}-${String((await this.requests.query("SELECT nextval('sophis_support_ticket_seq') AS value"))[0].value).padStart(6, '0')}`,
    });
    const saved = await this.requests.save(request);

    // Support tickets belong to the dedicated Support role only. Moderators and
    // administrators are notified only when Support explicitly escalates a case.
    try {
      const supportUsers = await this.users.find({ where: { role: UserRole.SUPPORT, isSuspended: false } });
      await Promise.all(supportUsers.map(account => this.notifications.createNotification(
        account.id, 'support_request_new', 'New support ticket',
        `Ticket ${saved.ticketNumber} has been submitted and is awaiting Support review.`, '/support/requests',
      )));
    } catch (error) {
      this.logger.warn(`Support request ${saved.ticketNumber} was saved but Support notifications could not be created: ${String(error)}`);
    }
    try {
      await this.notifications.createNotification(
        user.id,
        'support_request_submitted',
        'Your support request was submitted',
        `Ticket ${saved.ticketNumber} has been submitted successfully. Track its status in My Activity.`,
        '/my-activity',
      );
    } catch (error) {
      this.logger.warn(`Support request ${saved.ticketNumber} was saved but the requester notification could not be created: ${String(error)}`);
    }
    try {
      await this.supportEmail.notifyNewRequest(saved, user);
    } catch (error) {
      this.logger.error(`Support request ${saved.id} was saved but support email delivery failed: ${String(error)}`);
    }

    return {
      ...(await this.withSignedAttachmentUrls(saved)),
      confirmationMessage: `Your support ticket ${saved.ticketNumber} has been submitted. Track its status in this section; full responses will appear in My Activity.`,
    };
  }

  private async validateOwnedAttachments(userId: string, values: string[]): Promise<string[]> {
    const attachments = [...new Set(values.map(value => value.trim()).filter(Boolean))];
    if (attachments.length > 5) {
      throw new BadRequestException('A support request can include at most five attachments.');
    }

    const prefix = `support-attachments/${userId}/`;
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    for (const reference of attachments) {
      const key = this.s3.getKeyFromPublicUrl(reference);
      if (!key || !key.startsWith(prefix)) {
        throw new BadRequestException('Each support attachment must be uploaded by your account.');
      }
      const metadata = await this.s3.getObjectMetadata(key);
      if (
        !metadata ||
        !Number.isInteger(metadata.contentLength) ||
        metadata.contentLength! < 1 ||
        metadata.contentLength! > 5 * 1024 * 1024 ||
        !metadata.contentType ||
        !allowedTypes.has(metadata.contentType)
      ) {
        throw new BadRequestException('A support attachment is missing, too large, or has an unsupported file type.');
      }
    }
    return attachments.map(reference => this.s3.getKeyFromPublicUrl(reference)!);
  }

  private async withSignedAttachmentUrls<T extends SupportRequest>(request: T): Promise<T> {
    const attachments = (await Promise.all((request.attachments ?? []).map(async reference => {
      const key = this.s3.getKeyFromPublicUrl(reference);
      // Never return an untrusted or legacy external attachment URL. Only keys
      // in this application's private object store receive short-lived access.
      if (!key) return null;
      try {
        return await this.s3.createPresignedDownloadUrl(key, undefined, 'inline', 900);
      } catch (error) {
        // An unavailable storage provider or legacy object must not make the
        // entire support queue unavailable to Admin.
        this.logger.warn(`Support attachment for ticket ${request.ticketNumber} could not be signed: ${String(error)}`);
        return null;
      }
    }))).filter((url): url is string => Boolean(url));
    return { ...request, attachments } as T;
  }

  async listMineTracking(userId: string) {
    return this.requests.find({
      where: { userId },
      select: ['id', 'ticketNumber', 'subject', 'category', 'status', 'escalatedToRole', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async listMineForActivity(userId: string) {
    const requests = await this.requests.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(requests.map(request => this.withSignedAttachmentUrls(request)));
  }

  async listAdminEscalations(actor: User) {
    if (actor.role !== UserRole.ADMIN || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only an active, verified Admin can inspect escalated Support tickets.');
    }
    const requests = await this.requests.find({
      where: { escalatedToRole: 'admin' },
      relations: ['user', 'reviewer'],
      order: { escalatedAt: 'DESC' },
      take: 100,
    });
    if (!requests.length) return [];
    const decisions = await this.requests.query(
      `SELECT "sourceId", action, note, "actorEmail", "createdAt"
       FROM admin_escalation_decisions
       WHERE "sourceType" = 'support' AND "sourceId" = ANY($1::uuid[])
       ORDER BY "sourceId", "createdAt" DESC`,
      [requests.map(request => request.id)],
    );
    const historyById = new Map<string, any[]>();
    for (const decision of decisions as any[]) {
      const history = historyById.get(decision.sourceId) ?? [];
      history.push(decision);
      historyById.set(decision.sourceId, history);
    }
    return Promise.all(requests.map(async request => {
      const history = historyById.get(request.id) ?? [];
      return { ...(await this.withSignedAttachmentUrls(request)), adminDecision: history[0] ?? null, adminDecisionHistory: history };
    }));
  }

  async recordAdminEscalationDecision(id: string, actor: User, dto: AdminEscalationDecisionDto) {
    if (actor.role !== UserRole.ADMIN || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) {
      throw new ForbiddenException('Only an active, verified Admin can decide escalated Support tickets.');
    }
    const request = await this.requests.findOne({ where: { id }, relations: ['user'] });
    if (!request) throw new NotFoundException('Support ticket not found.');
    if (request.escalatedToRole !== 'admin') throw new ConflictException('This ticket is not currently escalated to Admin.');
    const latest = await this.requests.query(
      `SELECT action FROM admin_escalation_decisions
       WHERE "sourceType" = 'support' AND "sourceId" = $1::uuid
       ORDER BY "createdAt" DESC LIMIT 1`,
      [id],
    );
    if (latest[0]?.action === 'resolved') throw new ConflictException('This Admin escalation has already been resolved.');
    const result = await this.requests.query(
      `INSERT INTO admin_escalation_decisions
       ("sourceType", "sourceId", "ticketNumber", action, note, "actorId", "actorEmail")
       VALUES ('support', $1::uuid, $2, $3, $4, $5::uuid, $6)
       RETURNING id, action, note, "actorEmail", "createdAt"`,
      [request.id, request.ticketNumber, dto.action, dto.note.trim(), actor.id, actor.email],
    );
    try {
      if (dto.action === 'awaiting_information' && request.userId) {
        await this.notifications.createNotification(request.userId, 'support_request_status', 'More information requested', `Admin requested more information for ticket ${request.ticketNumber}: ${dto.note.trim()}`, '/my-activity');
      } else if (dto.action === 'resolved') {
        if (request.userId) await this.notifications.createNotification(request.userId, 'support_request_status', 'Admin escalation review completed', `Admin completed the escalation review for ticket ${request.ticketNumber}: ${dto.note.trim()}`, '/my-activity');
        const supportUsers = await this.users.find({ where: { role: UserRole.SUPPORT, isSuspended: false, accountStatus: 'active', emailVerified: true } });
        await Promise.all(supportUsers.map(account => this.notifications.createNotification(account.id, 'support_ticket_escalation_resolved', 'Admin completed an escalation review', `Admin recorded a final escalation decision for ticket ${request.ticketNumber}. Review the decision in the Admin escalation centre.`, '/support/requests')));
      } else if (dto.action === 'returned_to_team') {
        const supportUsers = await this.users.find({ where: { role: UserRole.SUPPORT, isSuspended: false, accountStatus: 'active', emailVerified: true } });
        await Promise.all(supportUsers.map(account => this.notifications.createNotification(account.id, 'support_ticket_escalation_returned', 'Admin returned an escalated ticket', `Ticket ${request.ticketNumber} was returned to Support: ${dto.note.trim()}`, '/support/requests')));
      }
    } catch (error) {
      this.logger.warn(`Admin decision for support ticket ${request.ticketNumber} was saved but notification delivery failed: ${String(error)}`);
    }
    return result[0];
  }

  async listForModeration(actor: User, status: 'pending' | 'under_review' | 'reviewed' | 'response_sent' | 'concluded' = 'pending') {
    if (actor.role !== UserRole.SUPPORT || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Support accounts can access this workflow.');
    const requests = await this.requests.createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .leftJoinAndSelect('request.reviewer', 'reviewer')
      .where('request.status = :status', { status })
      .andWhere('request."userId" IS NOT NULL')
      .orderBy('request."createdAt"', 'ASC')
      .getMany();
    return Promise.all(requests.map(request => this.withSignedAttachmentUrls(request)));
  }

  async updateStatus(id: string, actor: User, status: 'under_review' | 'reviewed') {
    if (actor.role !== UserRole.SUPPORT || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Support accounts can access this workflow.');
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Support ticket not found.');
    if (['response_sent', 'concluded'].includes(request.status)) throw new ConflictException('A responded ticket cannot return to an earlier stage.');
    if (status === 'under_review' && request.status !== 'pending') throw new BadRequestException('Only submitted tickets can move to Under review.');
    if (status === 'reviewed' && request.status !== 'under_review') throw new BadRequestException('Move the ticket to Under review before marking it reviewed.');
    request.status = status;
    const saved = await this.requests.save(request);
    try { if (request.userId) await this.notifications.createNotification(request.userId, 'support_request_status', 'Support ticket status updated', `Ticket ${request.ticketNumber} is now ${status.replace(/_/g, ' ')}.`, '/my-activity'); }
    catch (error) { this.logger.warn(`Support ticket ${request.ticketNumber} status changed but notification failed: ${String(error)}`); }
    return saved;
  }

  async conclude(id: string, actor: User, dto: ConcludeSupportRequestDto) {
    if (actor.role !== UserRole.SUPPORT || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Support accounts can access this workflow.');
    const request = await this.requests.findOne({ where: { id }, relations: ['user'] });
    if (!request) throw new NotFoundException('Support request not found');
    if (['response_sent', 'concluded'].includes(request.status)) throw new ConflictException('A response has already been sent for this support request.');
    if (request.status !== 'reviewed') throw new BadRequestException('Mark the ticket as Reviewed before sending a response.');
    const reviewer = await this.users.findOne({ where: { id: actor.id, role: UserRole.SUPPORT, isSuspended: false, accountStatus: 'active', emailVerified: true } });
    if (!reviewer) throw new ForbiddenException('The authenticated Support account is no longer active or authorized.');

    request.status = 'response_sent';
    request.resolutionMessage = dto.resolutionMessage.trim();
    request.reviewerId = actor.id;
    request.concludedAt = new Date();
    const saved = await this.requests.save(request);

    try {
      if (request.userId) await this.notifications.createNotification(
        request.userId,
        'support_request_resolved',
        'Your support request has a response',
        `Support has responded to ticket ${request.ticketNumber}. Open My Activity to read the full response.`,
        '/my-activity',
      );
    } catch (error) {
      this.logger.error(`Support request ${id} was concluded but its notification could not be created: ${String(error)}`);
    }
    try {
      if (request.user) await this.supportEmail.sendResolution(saved, request.user);
    } catch (error) {
      this.logger.error(`Support request ${id} was concluded but its email could not be sent: ${String(error)}`);
    }
    return saved;
  }

  async escalate(id: string, actor: User, targetRole: UserRole, reason: string) {
    if (actor.role !== UserRole.SUPPORT || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Support accounts can access this workflow.');
    if (targetRole !== UserRole.ADMIN) throw new BadRequestException('Support escalations may only be directed to Admin.');
    if (!reason?.trim()) throw new BadRequestException('An escalation reason is required.');
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Support ticket not found.');
    if (request.escalatedToRole === 'admin') throw new ConflictException('This support ticket has already been escalated to Admin.');
    const recipients = await this.users.find({ where: { role: targetRole, isSuspended: false, accountStatus: 'active', emailVerified: true } });
    if (!recipients.length) throw new BadRequestException('No active recipient account is configured for this escalation.');
    request.escalatedToRole = 'admin';
    request.escalationReason = reason.trim();
    request.escalatedAt = new Date();
    request.escalatedById = actor.id;
    await this.requests.save(request);
    await this.requests.query(
      'INSERT INTO admin_escalation_events ("sourceType", "sourceId", "ticketNumber", "actorId", "actorEmail", reason) VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6)',
      ['support', request.id, request.ticketNumber, actor.id, actor.email, reason.trim()],
    );
    await Promise.all([
      ...recipients.map(recipient => this.notifications.createNotification(recipient.id, 'support_ticket_escalated', 'Support ticket escalated', `Ticket ${request.ticketNumber} (${request.subject}, ${request.category}) was escalated by Support. Issue: ${request.description.slice(0, 900)}. Escalation reason: ${reason.trim()}`, '/admin/escalations')),
      ...(request.userId ? [this.notifications.createNotification(request.userId, 'support_request_status', 'Support ticket escalated for review', `Ticket ${request.ticketNumber} has been escalated for Admin review.`, '/my-activity')] : []),
    ]);
    return { success: true, ticketNumber: request.ticketNumber, notified: recipients.length };
  }
}
