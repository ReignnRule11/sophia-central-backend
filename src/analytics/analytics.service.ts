import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationReview } from '../moderation/entities/moderation-review.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ModerationReview)
    private readonly moderationReviewRepository: Repository<ModerationReview>,
  ) {}

  async getDashboard() {
    const totalUsers = await this.userRepository.count();
    const totalResources = await this.resourceRepository.count();
    const verifiedResources = await this.resourceRepository.count({
      where: { isVerified: true },
    });
    const pendingReviews = await this.resourceRepository.count({
      where: { moderationStatus: ResourceModerationStatus.PENDING },
    });

    const totalReviews = await this.moderationReviewRepository.count();

    return {
      summary: {
        totalUsers,
        totalResources,
        verifiedResources,
        pendingReviews,
        totalReviews,
        verificationRate: totalResources > 0 ? (verifiedResources / totalResources) * 100 : 0,
      },
      timestamp: new Date(),
    };
  }

  async getResourceAnalytics() {
    const resources = await this.resourceRepository.find({
      relations: ['uploader'],
    });

    const byType = {};
    const byStatus = {};
    let totalViews = 0;
    let totalDownloads = 0;

    for (const resource of resources) {
      byType[resource.type] = (byType[resource.type] || 0) + 1;
      byStatus[resource.moderationStatus] = (byStatus[resource.moderationStatus] || 0) + 1;
      totalViews += resource.views;
      totalDownloads += resource.downloads;
    }

    return {
      totalResources: resources.length,
      byType,
      byStatus,
      totalViews,
      totalDownloads,
      avgViewsPerResource: resources.length > 0 ? totalViews / resources.length : 0,
      avgDownloadsPerResource: resources.length > 0 ? totalDownloads / resources.length : 0,
    };
  }

  async getModerationAnalytics() {
    const reviews = await this.moderationReviewRepository.find({
      relations: ['reviewer'],
    });

    const byReviewer = {};
    const byStatus = {};

    for (const review of reviews) {
      byReviewer[review.reviewer?.email || 'unknown'] = (byReviewer[review.reviewer?.email || 'unknown'] || 0) + 1;
      byStatus[review.status] = (byStatus[review.status] || 0) + 1;
    }

    return {
      totalReviews: reviews.length,
      byReviewer,
      byStatus,
      avgReviewsPerModerator: Object.keys(byReviewer).length > 0
        ? reviews.length / Object.keys(byReviewer).length
        : 0,
    };
  }

  async getUserAnalytics() {
    const users = await this.userRepository.find();

    const byRole = {};
    let totalStudents = 0;
    let totalLecturers = 0;

    for (const user of users) {
      byRole[user.role] = (byRole[user.role] || 0) + 1;
      if (user.role === UserRole.STUDENT) totalStudents++;
      if (user.role === UserRole.LECTURER) totalLecturers++;
    }

    return {
      totalUsers: users.length,
      byRole,
      totalStudents,
      totalLecturers,
      registrationTrend: {
        // Calculate from user creation dates
        message: 'Implement date-based trend analysis for production',
      },
    };
  }
}
