import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportRequest } from './entities/support-request.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { ConcludeSupportRequestDto } from './dto/conclude-support-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { S3Service } from '../upload/s3.service';
import { SupportEmailService } from './support-email.service';

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
      senderName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      senderEmail: user.email,
      senderInstitution: user.institution || null,
      senderFaculty: user.faculty || null,
      senderDepartment: user.department || null,
      senderAccountType: user.role,
      emailVerifiedAt: user.emailVerified ? new Date() : null,
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

  async createPublic(dto: import('./dto/create-public-support-request.dto').CreatePublicSupportRequestDto) {
    const email = dto.email.trim().toLowerCase();
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const request = this.requests.create({
      userId: null,
      senderName: dto.name.trim(),
      senderEmail: email,
      senderInstitution: dto.institution?.trim() || null,
      senderFaculty: dto.faculty?.trim() || null,
      senderDepartment: dto.department?.trim() || null,
      senderAccountType: null,
      emailVerifiedAt: null,
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      subject: dto.subject.trim(),
      category: dto.category,
      description: dto.description.trim(),
      links: (dto.links ?? []).map(link => link.trim()).filter(Boolean),
      attachments: [],
      status: 'pending',
      ticketNumber: `SUP-${new Date().getFullYear()}-${String((await this.requests.query("SELECT nextval('sophis_support_ticket_seq') AS value"))[0].value).padStart(6, '0')}`,
    });
    const saved = await this.requests.save(request);
    try {
      await this.supportEmail.sendGuestVerification(saved, token);
    } catch (error) {
      this.logger.error(`Guest support ticket ${saved.ticketNumber} was saved but verification email delivery failed: ${String(error)}`);
      throw new BadRequestException('We could not send the verification email right now. Please try again shortly.');
    }
    return {
      success: true,
      message: 'If this email address can receive messages, a verification link will arrive shortly. Verify it to submit your ticket to Support.',
    };
  }

  async verifyPublicEmail(token: string) {
    if (!token || !/^[a-f0-9]{64}$/i.test(token)) throw new BadRequestException('This support verification link is invalid or has expired.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const request = await this.requests.createQueryBuilder('request')
      .addSelect(['request.emailVerificationTokenHash', 'request.emailVerificationExpiresAt'])
      .where('request."emailVerificationTokenHash" = :tokenHash', { tokenHash })
      .getOne();
    if (!request) throw new BadRequestException('This support verification link is invalid or has expired. Please submit a new request.');
    // Verification is idempotent so email clients and React development StrictMode
    // can safely retry the landing request without duplicating tickets or alerts.
    if (request.emailVerifiedAt) {
      return { success: true, ticketNumber: request.ticketNumber, message: `Your email has already been verified and ticket ${request.ticketNumber} has been submitted to Sophis Central Support.` };
    }
    if (!request.emailVerificationExpiresAt || request.emailVerificationExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This support verification link is invalid or has expired. Please submit a new request.');
    }

    const verifiedAt = new Date();
    const account = request.senderEmail
      ? await this.users.findOne({ where: { email: request.senderEmail, emailVerified: true } })
      : null;
    const linkableAccount = account &&
      [UserRole.STUDENT, UserRole.LECTURER].includes(account.role) &&
      !account.isSuspended &&
      account.accountStatus === 'active'
      ? account
      : null;

    request.emailVerifiedAt = verifiedAt;
    // Keep only the hash as an idempotency key; the token is never stored in plaintext.
    // Expiry is cleared once verified, and repeat calls return the same ticket reference.
    request.emailVerificationExpiresAt = null;
    if (linkableAccount) {
      request.userId = linkableAccount.id;
      request.senderName = [linkableAccount.firstName, linkableAccount.lastName].filter(Boolean).join(' ').trim() || request.senderName;
      request.senderInstitution = linkableAccount.institution || request.senderInstitution;
      request.senderFaculty = linkableAccount.faculty || request.senderFaculty;
      request.senderDepartment = linkableAccount.department || request.senderDepartment;
      request.senderAccountType = linkableAccount.role;
    }
    const saved = await this.requests.save(request);

    try {
      const supportUsers = await this.users.find({ where: { role: UserRole.SUPPORT, isSuspended: false } });
      await Promise.all(supportUsers.map(account => this.notifications.createNotification(
        account.id,
        'support_request_new',
        'New support ticket',
        `Ticket ${saved.ticketNumber} has been email-verified and is awaiting Support review.`,
        '/support/requests',
      )));
    } catch (error) {
      this.logger.warn(`Verified support ticket ${saved.ticketNumber} was saved but Support notifications could not be created: ${String(error)}`);
    }
    if (linkableAccount) {
      try {
        await this.notifications.createNotification(
          linkableAccount.id,
          'support_request_submitted',
          'Your support request was submitted',
          `Ticket ${saved.ticketNumber} has been submitted. Track it in My Activity.`,
          '/my-activity',
        );
      } catch (error) {
        this.logger.warn(`Verified support ticket ${saved.ticketNumber} was saved but the requester notification failed: ${String(error)}`);
      }
    }
    try {
      await this.supportEmail.notifyNewGuestRequest(saved);
    } catch (error) {
      this.logger.error(`Verified support ticket ${saved.ticketNumber} was saved but confirmation email delivery failed: ${String(error)}`);
    }
    return { success: true, ticketNumber: saved.ticketNumber, message: `Your email has been verified and ticket ${saved.ticketNumber} has been submitted to Sophis Central Support.` };
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
    const attachments = await Promise.all((request.attachments ?? []).map(async reference => {
      const key = this.s3.getKeyFromPublicUrl(reference);
      if (!key) return reference;
      return this.s3.createPresignedDownloadUrl(key, undefined, 'inline', 900);
    }));
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

  async listForModeration(actor: User, status: 'pending' | 'under_review' | 'reviewed' | 'response_sent' | 'concluded' = 'pending') {
    if (actor.role !== UserRole.SUPPORT || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Support accounts can access this workflow.');
    const requests = await this.requests.createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .leftJoinAndSelect('request.reviewer', 'reviewer')
      .where('request.status = :status', { status })
      .andWhere('(request."userId" IS NOT NULL OR request."emailVerifiedAt" IS NOT NULL)')
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
      else if (request.senderEmail && request.emailVerifiedAt) await this.supportEmail.sendGuestResolution(saved);
    } catch (error) {
      this.logger.error(`Support request ${id} was concluded but its email could not be sent: ${String(error)}`);
    }
    return saved;
  }

  async escalate(id: string, actor: User, targetRole: UserRole.MODERATOR | UserRole.ADMIN, reason: string) {
    if (actor.role !== UserRole.SUPPORT || actor.isSuspended || actor.accountStatus !== 'active' || actor.emailVerified !== true) throw new ForbiddenException('Only active Support accounts can access this workflow.');
    if (![UserRole.MODERATOR, UserRole.ADMIN].includes(targetRole)) throw new BadRequestException('Escalations may only be directed to Moderator or Admin.');
    if (!reason?.trim()) throw new BadRequestException('An escalation reason is required.');
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Support ticket not found.');
    const recipients = await this.users.find({ where: { role: targetRole, isSuspended: false } });
    if (!recipients.length) throw new BadRequestException('No active recipient account is configured for this escalation.');
    request.escalatedToRole = targetRole === UserRole.MODERATOR ? 'moderator' : 'admin';
    await this.requests.save(request);
    await Promise.all([
      ...recipients.map(recipient => this.notifications.createNotification(recipient.id, 'support_ticket_escalated', 'Support ticket escalated', `Ticket ${request.ticketNumber} (${request.subject}, ${request.category}) was escalated by Support. Issue: ${request.description.slice(0, 900)}. Escalation reason: ${reason.trim()}`, '/notifications')),
      ...(request.userId ? [this.notifications.createNotification(request.userId, 'support_request_status', 'Support ticket escalated for review', `Ticket ${request.ticketNumber} has been escalated for ${request.escalatedToRole === 'moderator' ? 'Moderator' : 'Admin'} review.`, '/my-activity')] : []),
    ]);
    return { success: true, ticketNumber: request.ticketNumber, notified: recipients.length };
  }
}
