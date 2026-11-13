import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ModerationReview } from '../moderation/entities/moderation-review.entity';
import { UserActivityEvent } from './entities/user-activity-event.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ModerationReview)
    private readonly moderationReviewRepository: Repository<ModerationReview>,
    @InjectRepository(UserActivityEvent)
    private readonly activityRepository: Repository<UserActivityEvent>,
  ) {}

  async recordSearch(userId: string, query: string) {
    const normalized = query.trim().slice(0, 500);
    if (!normalized) return { recorded: false };
    await this.activityRepository.save(this.activityRepository.create({ userId, eventType: 'search', query: normalized }));
    return { recorded: true };
  }

  async recordResourceActivity(userId: string, eventType: 'view' | 'download', resourceId: string) {
    await this.activityRepository.save(this.activityRepository.create({ userId, eventType, resourceId }));
  }

  async recordStudyActivity(userId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const events = await this.activityRepository.find({ where: { userId, eventType: 'study' }, order: { createdAt: 'DESC' }, take: 400 });
    if (!events.some((event) => event.createdAt.toISOString().slice(0, 10) === today)) {
      await this.activityRepository.save(this.activityRepository.create({ userId, eventType: 'study' }));
    }
    return this.getStudyStreak(userId);
  }

  async getStudyStreak(userId: string) {
    const events = await this.activityRepository.find({ where: { userId, eventType: 'study' }, order: { createdAt: 'DESC' }, take: 400 });
    const days = new Set(events.map((event) => event.createdAt.toISOString().slice(0, 10)));
    let currentStreak = 0;
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    while (days.has(cursor.toISOString().slice(0, 10))) {
      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return { currentStreak, lastStudyDate: events[0]?.createdAt ?? null, recordedToday: days.has(new Date().toISOString().slice(0, 10)) };
  }

  async getActivityAnalytics(role: UserRole) {
    if (![UserRole.STUDENT, UserRole.LECTURER].includes(role)) throw new BadRequestException('Analytics role must be student or lecturer.');
    const events = await this.activityRepository.createQueryBuilder('event')
      .innerJoin(User, 'activityUser', '"activityUser"."id"::text = event."userId"')
      .where('activityUser.role = :role', { role })
      .orderBy('event.createdAt', 'DESC')
      .getMany();

    const eventsByUser = new Map<string, number>();
    const queryCounts = new Map<string, number>();
    const resourceActivity = new Map<string, { views: number; downloads: number }>();
    for (const event of events) {
      eventsByUser.set(event.userId, (eventsByUser.get(event.userId) || 0) + 1);
      if (event.eventType === 'search' && event.query) queryCounts.set(event.query, (queryCounts.get(event.query) || 0) + 1);
      if (event.resourceId && (event.eventType === 'view' || event.eventType === 'download')) {
        const current = resourceActivity.get(event.resourceId) || { views: 0, downloads: 0 };
        if (event.eventType === 'view') current.views += 1;
        if (event.eventType === 'download') current.downloads += 1;
        resourceActivity.set(event.resourceId, current);
      }
    }
    const uniqueUsers = eventsByUser.size;
    const returningUsers = Array.from(eventsByUser.values()).filter((count) => count > 1).length;
    const resourceIds = Array.from(resourceActivity.keys());
    const resources = resourceIds.length ? await this.resourceRepository.find({ where: { id: In(resourceIds) }, relations: ['uploader'] }) : [];
    const popularResources = resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      course: resource.course,
      views: resourceActivity.get(resource.id)?.views || 0,
      downloads: resourceActivity.get(resource.id)?.downloads || 0,
      contributor: [resource.uploader?.firstName, resource.uploader?.lastName].filter(Boolean).join(' ') || resource.uploader?.email || 'Unknown',
    })).sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads)).slice(0, 10);
    const activeResourceIds = new Set(resourceIds);
    const contributorIds = new Set(resources.map((resource) => resource.uploaderId));
    return {
      role,
      searches: events.filter((event) => event.eventType === 'search').length,
      uniqueUsers,
      returningUsers,
      retentionRate: uniqueUsers ? Math.round((returningUsers / uniqueUsers) * 100) : 0,
      views: events.filter((event) => event.eventType === 'view').length,
      downloads: events.filter((event) => event.eventType === 'download').length,
      contributors: contributorIds.size,
      popularResources,
      topSearches: Array.from(queryCounts.entries()).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      activeResources: activeResourceIds.size,
    };
  }

  async getLecturerResourceAnalytics(lecturerId: string) {
    const resources = await this.resourceRepository.find({ where: { uploaderId: lecturerId }, order: { views: 'DESC' } });
    const ids = resources.map((resource) => resource.id);
    const events = ids.length ? await this.activityRepository.find({ where: { resourceId: In(ids) }, order: { createdAt: 'DESC' } }) : [];
    const ownSearches = await this.activityRepository.find({ where: { userId: lecturerId, eventType: 'search' }, order: { createdAt: 'DESC' } });
    const searchCounts = new Map<string, number>();
    for (const event of ownSearches) if (event.query) searchCounts.set(event.query, (searchCounts.get(event.query) || 0) + 1);
    const byUser = new Map<string, number>();
    for (const event of events) byUser.set(event.userId, (byUser.get(event.userId) || 0) + 1);
    const uniqueUsers = byUser.size;
    const returningUsers = Array.from(byUser.values()).filter((count) => count > 1).length;
    return {
      totalResources: resources.length,
      totalViews: resources.reduce((sum, resource) => sum + Number(resource.views || 0), 0),
      totalDownloads: resources.reduce((sum, resource) => sum + Number(resource.downloads || 0), 0),
      uniqueUsers,
      returningUsers,
      retentionRate: uniqueUsers ? Math.round((returningUsers / uniqueUsers) * 100) : 0,
      searches: ownSearches.length,
      topSearches: Array.from(searchCounts.entries()).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      contributors: new Set(resources.map((resource) => resource.uploaderId)).size,
      popularResources: resources.slice(0, 10).map((resource) => ({ id: resource.id, title: resource.title, course: resource.course, views: resource.views, downloads: resource.downloads })),
    };
  }

  async getDashboard() {
    const totalUsers = await this.userRepository.count();
    const totalResources = await this.resourceRepository.count();
    const verifiedResources = await this.resourceRepository.count({ where: { isVerified: true } });
    const pendingReviews = await this.resourceRepository.count({ where: { moderationStatus: ResourceModerationStatus.PENDING } });
    const totalReviews = await this.moderationReviewRepository.count();
    return {
      summary: { totalUsers, totalResources, verifiedResources, pendingReviews, totalReviews, verificationRate: totalResources > 0 ? (verifiedResources / totalResources) * 100 : 0 },
      timestamp: new Date(),
    };
  }

  async getResourceAnalytics() {
    const resources = await this.resourceRepository.find({ relations: ['uploader'] });
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalViews = 0;
    let totalDownloads = 0;
    for (const resource of resources) {
      byType[resource.type] = (byType[resource.type] || 0) + 1;
      byStatus[resource.moderationStatus] = (byStatus[resource.moderationStatus] || 0) + 1;
      totalViews += resource.views;
      totalDownloads += resource.downloads;
    }
    return {
      totalResources: resources.length, byType, byStatus, totalViews, totalDownloads,
      avgViewsPerResource: resources.length > 0 ? totalViews / resources.length : 0,
      avgDownloadsPerResource: resources.length > 0 ? totalDownloads / resources.length : 0,
      popularResources: [...resources].sort((a, b) => b.views + b.downloads - (a.views + a.downloads)).slice(0, 10).map((resource) => ({ id: resource.id, title: resource.title, course: resource.course, views: resource.views, downloads: resource.downloads, contributor: [resource.uploader?.firstName, resource.uploader?.lastName].filter(Boolean).join(' ') || resource.uploader?.email || 'Unknown' })),
      contributors: new Set(resources.map((resource) => resource.uploaderId)).size,
    };
  }

  async getModerationAnalytics() {
    const reviews = await this.moderationReviewRepository.find({ relations: ['reviewer'] });
    const byReviewer: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const review of reviews) {
      const reviewer = review.reviewer?.email || 'unknown';
      byReviewer[reviewer] = (byReviewer[reviewer] || 0) + 1;
      byStatus[review.status] = (byStatus[review.status] || 0) + 1;
    }
    return { totalReviews: reviews.length, byReviewer, byStatus, avgReviewsPerModerator: Object.keys(byReviewer).length ? reviews.length / Object.keys(byReviewer).length : 0 };
  }

  async getUserAnalytics() {
    const users = await this.userRepository.find({ select: ['id', 'role', 'createdAt'] });
    const byRole: Record<string, number> = {};
    let totalStudents = 0;
    let totalLecturers = 0;
    for (const user of users) {
      byRole[user.role] = (byRole[user.role] || 0) + 1;
      if (user.role === UserRole.STUDENT) totalStudents++;
      if (user.role === UserRole.LECTURER) totalLecturers++;
    }
    return { totalUsers: users.length, byRole, totalStudents, totalLecturers, registrationTrend: { message: 'Date-based trend analysis is not yet implemented.' } };
  }
}
