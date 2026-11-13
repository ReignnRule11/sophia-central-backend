import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationReview } from './entities/moderation-review.entity';
import { ReviewResourceDto } from './dto/review-resource.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PointsService } from '../points/points.service';
import { ResourceRewardOutbox } from '../points/entities/resource-reward-outbox.entity';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ModerationReview)
    private readonly moderationReviewRepository: Repository<ModerationReview>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly pointsService: PointsService,
  ) {}

  async getQueue(viewer: User) {
    if (viewer.role === UserRole.REVIEWER && viewer.isSuspended) return [];
    const isPlatformModerator = [UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role);
    return this.resourceRepository.find({
      where: isPlatformModerator
        ? { moderationStatus: ResourceModerationStatus.PENDING }
        : { moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: viewer.id },
      relations: ['uploader', 'assignedReviewer'],
      order: { createdAt: 'ASC' },
    });
  }

  async getHistory(viewer: User) {
    const isPlatformModerator = [UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role);
    return this.moderationReviewRepository.find({
      where: isPlatformModerator ? {} : { reviewer: { id: viewer.id } },
      relations: ['resource', 'resource.uploader', 'reviewer'],
      order: { createdAt: 'DESC' },
    });
  }

  async assignReviewer(resourceId: string, reviewerId: string) {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
      throw new ConflictException('Only pending resources can be assigned for review');
    }
    const reviewer = await this.userRepository.findOne({ where: { id: reviewerId } });
    if (!reviewer || reviewer.role !== UserRole.REVIEWER || reviewer.isSuspended) {
      throw new BadRequestException('Select an active, administrator-approved academic reviewer');
    }
    if (!Array.isArray(reviewer.reviewerExpertise) || reviewer.reviewerExpertise.length === 0) {
      throw new BadRequestException('The selected reviewer has no recorded subject expertise');
    }
    resource.assignedReviewerId = reviewer.id;
    const saved = await this.resourceRepository.save(resource);
    try {
      await this.notificationsService.createNotification(
        reviewer.id,
        'resource_review_assigned',
        'A new academic resource was assigned to you',
        `“${resource.title}” is ready for your academic review.`,
        '/moderation',
      );
    } catch (error) {
      this.logger.warn(`Resource ${resource.id} was assigned but the reviewer notification could not be created: ${String(error)}`);
    }
    return saved;
  }

  async reviewResource(id: string, dto: ReviewResourceDto, reviewer: User) {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['uploader'],
    });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
      throw new ConflictException('This resource is no longer awaiting review');
    }
    if (reviewer.role === UserRole.REVIEWER && reviewer.isSuspended) {
      throw new ForbiddenException('Suspended reviewer accounts cannot access the review workflow');
    }
    if (reviewer.role === UserRole.REVIEWER && resource.assignedReviewerId !== reviewer.id) {
      throw new ForbiddenException('This resource is not assigned to your reviewer account');
    }
    if (![ResourceModerationStatus.APPROVED, ResourceModerationStatus.REJECTED, ResourceModerationStatus.REVISION_REQUESTED].includes(dto.status)) {
      throw new BadRequestException('Choose approve, reject or request revision');
    }
    if ((dto.status === ResourceModerationStatus.REJECTED || dto.status === ResourceModerationStatus.REVISION_REQUESTED) && !dto.note?.trim()) {
      throw new BadRequestException('A clear reviewer note is required for rejection or revision requests');
    }

    const reviewerRecord = await this.userRepository.findOne({ where: { id: reviewer.id } });
    if (!reviewerRecord) throw new NotFoundException('Authenticated reviewer not found');

    resource.moderationStatus = dto.status;
    resource.isVerified = dto.status === ResourceModerationStatus.APPROVED;
    resource.assignedReviewerId = null;

    // Commit approval, review history, and the reward instruction atomically.
    // A process crash after this transaction cannot lose the student's reward.
    const savedReview = await this.resourceRepository.manager.transaction(async manager => {
      const savedResource = await manager.save(Resource, resource);
      const review = manager.create(ModerationReview, {
        resource: savedResource,
        reviewer: reviewerRecord,
        status: dto.status,
        note: dto.note?.trim() || undefined,
      });
      const saved = await manager.save(ModerationReview, review);

      if (
        dto.status === ResourceModerationStatus.APPROVED &&
        resource.uploader?.role === UserRole.STUDENT &&
        !resource.uploader.isSuspended
      ) {
        await manager.save(ResourceRewardOutbox, manager.create(ResourceRewardOutbox, {
          resourceId: resource.id,
          userId: resource.uploaderId,
        }));
      }
      return saved;
    });

    let wisdomRewardAwarded = false;
    if (
      dto.status === ResourceModerationStatus.APPROVED &&
      resource.uploader?.role === UserRole.STUDENT &&
      !resource.uploader.isSuspended
    ) {
      try {
        wisdomRewardAwarded = await this.pointsService.processResourceApprovalReward(resource.id);
      } catch (error) {
        // The outbox worker will retry this durable pending reward.
        this.logger.error(`Resource ${resource.id} was approved; its Wisdom Points reward remains queued for retry: ${String(error)}`);
      }
    }

    try {
      const approved = dto.status === ResourceModerationStatus.APPROVED;
      const revisionRequested = dto.status === ResourceModerationStatus.REVISION_REQUESTED;
      await this.notificationsService.createNotification(
        resource.uploaderId,
        approved ? 'resource_approved' : revisionRequested ? 'resource_revision_requested' : 'resource_rejected',
        approved ? 'Your resource was approved' : revisionRequested ? 'Changes requested for your resource' : 'Your resource was rejected',
        approved
          ? `“${resource.title}” has been approved and is now available in the shared library.${wisdomRewardAwarded ? ' You have also earned 10 Wisdom Points.' : ''}`
          : revisionRequested
            ? `“${resource.title}” needs revision before it can be approved. Reviewer feedback: ${dto.note?.trim()}`
            : `“${resource.title}” was rejected during moderation. Reviewer note: ${dto.note?.trim()}`,
        approved ? '/library' : '/my-resources',
      );
    } catch (error) {
      this.logger.warn(`Could not create moderation notification for resource ${resource.id}: ${String(error)}`);
    }

    if (reviewer.role === UserRole.REVIEWER) {
      try {
        const moderators = await this.userRepository.find({
          where: { role: UserRole.MODERATOR, isSuspended: false },
        });
        await Promise.all(moderators.map(moderator => this.notificationsService.createNotification(
          moderator.id,
          'resource_review_completed',
          'An academic resource review was completed',
          `A reviewer completed the review of “${resource.title}” with status: ${dto.status.replace(/_/g, ' ')}.`,
          '/moderation',
        )));
      } catch (error) {
        this.logger.warn(`Resource ${resource.id} was reviewed but moderator notifications could not be created: ${String(error)}`);
      }
    }

    return savedReview;
  }
}
