import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { ModerationReview } from './entities/moderation-review.entity';
import { ReviewResourceDto } from './dto/review-resource.dto';
import { NotificationsService } from '../notifications/notifications.service';

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
  ) {}

  async getQueue() {
    return this.resourceRepository.find({
      where: { moderationStatus: ResourceModerationStatus.PENDING },
      relations: ['uploader'],
      order: { createdAt: 'ASC' },
    });
  }

  async getHistory() {
    return this.moderationReviewRepository.find({
      relations: ['resource', 'resource.uploader', 'reviewer'],
      order: { createdAt: 'DESC' },
    });
  }

  async reviewResource(id: string, dto: ReviewResourceDto, reviewerId: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['uploader'],
    });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
      throw new ConflictException('This resource has already been reviewed');
    }

    const reviewer = await this.userRepository.findOne({ where: { id: reviewerId } });
    if (!reviewer) throw new NotFoundException('Authenticated reviewer not found');

    resource.moderationStatus = dto.status;
    resource.isVerified = dto.status === ResourceModerationStatus.APPROVED;
    await this.resourceRepository.save(resource);

    const review = this.moderationReviewRepository.create({
      resource,
      reviewer,
      status: dto.status,
      note: dto.note,
    });
    const savedReview = await this.moderationReviewRepository.save(review);

    // A notification failure must not roll back an already-recorded moderation decision.
    try {
      const approved = dto.status === ResourceModerationStatus.APPROVED;
      await this.notificationsService.createNotification(
        resource.uploaderId,
        approved ? 'resource_approved' : 'resource_rejected',
        approved ? 'Your resource was approved' : 'Your resource was rejected',
        approved
          ? `“${resource.title}” has been approved and is now available in the shared library.`
          : `“${resource.title}” was rejected during moderation.${dto.note ? ` Reviewer note: ${dto.note}` : ''}`,
        approved ? '/library' : '/lecturer',
      );
    } catch (error) {
      this.logger.warn(`Could not create moderation notification for resource ${resource.id}: ${String(error)}`);
    }

    return savedReview;
  }
}
