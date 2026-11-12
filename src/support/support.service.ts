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
    });
    const saved = await this.requests.save(request);

    // Notify the moderator workspace and the dedicated support mailbox without
    // making ticket creation depend on email-provider availability.
    try {
      const moderators = await this.users.find({ where: { role: UserRole.MODERATOR, isSuspended: false } });
      await Promise.all(moderators.map(moderator => this.notifications.createNotification(
        moderator.id,
        'support_request_new',
        'New support request received',
        `${user.firstName || user.email} submitted “${saved.subject}”.`,
        '/moderation/support',
      )));
    } catch (error) {
      this.logger.warn(`Support request ${saved.id} was saved but moderator notifications could not be created: ${String(error)}`);
    }
    try {
      await this.supportEmail.notifyNewRequest(saved, user);
    } catch (error) {
      this.logger.error(`Support request ${saved.id} was saved but support email delivery failed: ${String(error)}`);
    }

    return {
      ...(await this.withSignedAttachmentUrls(saved)),
      confirmationMessage: 'Your message has been sent to Support. Our administration team will review your request and provide an update through your notifications.',
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
    const attachments = await Promise.all((request.attachments ?? []).map(async reference => {
      const key = this.s3.getKeyFromPublicUrl(reference);
      if (!key) return reference;
      return this.s3.createPresignedDownloadUrl(key, undefined, 'inline', 900);
    }));
    return { ...request, attachments } as T;
  }

  async listMine(userId: string) {
    const requests = await this.requests.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return Promise.all(requests.map(request => this.withSignedAttachmentUrls(request)));
  }

  async listForModeration(status: 'pending' | 'concluded' = 'pending') {
    const requests = await this.requests.find({
      where: { status },
      relations: ['user', 'reviewer'],
      order: { createdAt: 'ASC' },
    });
    return Promise.all(requests.map(request => this.withSignedAttachmentUrls(request)));
  }

  async conclude(id: string, reviewerId: string, dto: ConcludeSupportRequestDto) {
    const request = await this.requests.findOne({ where: { id }, relations: ['user'] });
    if (!request) throw new NotFoundException('Support request not found');
    if (request.status === 'concluded') throw new ConflictException('This support request has already been concluded');
    const reviewer = await this.users.findOne({ where: { id: reviewerId } });
    if (!reviewer) throw new NotFoundException('Administrator account not found');

    request.status = 'concluded';
    request.resolutionMessage = dto.resolutionMessage.trim();
    request.reviewerId = reviewerId;
    request.concludedAt = new Date();
    const saved = await this.requests.save(request);

    try {
      await this.notifications.createNotification(
        request.userId,
        'support_request_resolved',
        'Your support request has been concluded',
        `Our Sophis Central Support team has reviewed “${request.subject}”. ${request.resolutionMessage}`,
        '/notifications',
      );
    } catch (error) {
      this.logger.error(`Support request ${id} was concluded but its notification could not be created: ${String(error)}`);
    }
    if (request.user) {
      try {
        await this.supportEmail.sendResolution(saved, request.user);
      } catch (error) {
        this.logger.error(`Support request ${id} was concluded but its email could not be sent: ${String(error)}`);
      }
    }
    return saved;
  }
}
