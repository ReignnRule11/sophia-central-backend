import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { ModerationReview } from './entities/moderation-review.entity';
import { ReviewResourceDto } from './dto/review-resource.dto';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ModerationReview)
    private readonly moderationReviewRepository: Repository<ModerationReview>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getQueue() {
    return this.resourceRepository.find({
      where: {
        moderationStatus: ResourceModerationStatus.PENDING,
      },
      relations: ['uploader'],
      order: { createdAt: 'ASC' },
    });
  }

  async reviewResource(id: string, dto: ReviewResourceDto, reviewerId: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: ['uploader'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
      throw new ConflictException('This resource has already been reviewed');
    }

    const reviewer = await this.userRepository.findOne({ where: { id: reviewerId } });
    if (!reviewer) {
      throw new NotFoundException('Authenticated reviewer not found');
    }

    // Persist the decision on the resource itself so lecturer/resource views,
    // the public library and subsequent queue reads see the same authoritative state.
    resource.moderationStatus = dto.status;
    resource.isVerified = dto.status === ResourceModerationStatus.APPROVED;
    await this.resourceRepository.save(resource);

    const review = this.moderationReviewRepository.create({
      resource,
      reviewer,
      status: dto.status,
      note: dto.note,
    });

    return this.moderationReviewRepository.save(review);
  }
}
