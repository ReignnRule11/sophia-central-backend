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
import { randomUUID } from 'node:crypto';
import { ReviewerConflictDeclarationDto } from './dto/reviewer-conflict-declaration.dto';
import { hasActiveGlobalReviewerAuthority } from '../users/reviewer-permissions';

function hasReviewerCapability(user: User): boolean {
  return user.hasReviewerAccess === true || (user.hasReviewerAccess == null && user.role === UserRole.REVIEWER);
}

function normalizeReviewScope(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}


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
    if (viewer.role !== UserRole.ADMIN && !hasReviewerCapability(viewer)) {
      throw new ForbiddenException('Only approved academic reviewers and admins can access the academic resource queue.');
    }
    if (hasReviewerCapability(viewer) && viewer.isSuspended) return [];
    const queue = await this.resourceRepository.find({
      where: viewer.role === UserRole.ADMIN || hasActiveGlobalReviewerAuthority(viewer)
        ? { moderationStatus: ResourceModerationStatus.PENDING }
        : { moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: viewer.id },
      relations: ['uploader', 'assignedReviewer'],
      order: { createdAt: 'ASC' },
    });
    if (viewer.role !== UserRole.ADMIN) {
      // The Global Academic Reviewer can see the full pending queue, but their
      // existing declaration must be hydrated just like an assigned reviewer's.
      // Otherwise the client may attempt a duplicate PATCH and receive 409.
      for (const resource of queue) {
        if (!resource.reviewAssignmentId) { resource.reviewConflictDeclaration = null; continue; }
        const rows = await this.resourceRepository.manager.query(
          'SELECT declaration FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid AND "reviewerId" = $2::uuid ORDER BY "createdAt" DESC LIMIT 1',
          [resource.reviewAssignmentId, viewer.id],
        );
        resource.reviewConflictDeclaration = rows[0]?.declaration ?? null;
      }
    }
    // Keep raw storage URLs out of the review queue response. The reader obtains
    // a short-lived inline URL through the authenticated resource file endpoint.
    return queue.map((resource) => ({ ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined }));
  }

  async getResourceReviewHistory(resourceId: string, viewer: User) {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException('Resource not found.');
    if (viewer.role !== UserRole.ADMIN && resource.uploaderId !== viewer.id) {
      throw new ForbiddenException('Only the original uploader or an administrator can inspect this review history.');
    }
    return this.moderationReviewRepository.find({
      where: { resourceId },
      relations: ['reviewer'],
      order: { createdAt: 'ASC' },
    });
  }

  async getReviewerRoster(viewer: User) {
    if (viewer.role !== UserRole.ADMIN && !hasActiveGlobalReviewerAuthority(viewer)) {
      throw new ForbiddenException('Only administrators or the Global Academic Reviewer can inspect the reviewer roster.');
    }
    return this.userRepository.find({
      where: [
        { hasReviewerAccess: true },
        { reviewerStatus: 'suspended' },
        { reviewerStatus: 'revoked' },
      ],
      select: ['id', 'firstName', 'lastName', 'email', 'academicHandle', 'role', 'reviewerStatus', 'reviewerExpertise', 'reviewerAcademicLevels', 'isSuspended', 'isGlobalReviewer', 'institution', 'faculty', 'department'],
      order: { createdAt: 'ASC' },
    });
  }

  async getConflictDeclarations(viewer: User) {
    if (viewer.role !== UserRole.ADMIN && !hasActiveGlobalReviewerAuthority(viewer)) throw new ForbiddenException('Only administrators or the Global Academic Reviewer can inspect reviewer conflict declarations.');
    return this.resourceRepository.manager.query(`
      SELECT d."id", d."assignmentId", d."resourceId", d."reviewerId", d."declaration", d."reason", d."createdAt",
             r."title" AS "resourceTitle", u."firstName" AS "reviewerFirstName",
             u."lastName" AS "reviewerLastName", u."email" AS "reviewerEmail",
             u."academicHandle" AS "reviewerAcademicHandle"
      FROM "reviewer_conflict_declarations" d
      LEFT JOIN "resources" r ON r."id" = d."resourceId"
      LEFT JOIN "users" u ON u."id" = d."reviewerId"
      ORDER BY d."createdAt" DESC
      LIMIT 250
    `);
  }

  async getHistory(viewer: User) {
    if (viewer.role !== UserRole.ADMIN && !hasReviewerCapability(viewer)) {
      throw new ForbiddenException('Only approved academic reviewers and admins can access academic review history.');
    }
    if (hasReviewerCapability(viewer) && viewer.isSuspended) return [];
    return this.moderationReviewRepository.find({
      where: viewer.role === UserRole.ADMIN || hasActiveGlobalReviewerAuthority(viewer) ? {} : { reviewer: { id: viewer.id } },
      relations: ['resource', 'resource.uploader', 'reviewer'],
      order: { createdAt: 'DESC' },
    });
  }

  async assignReviewer(resourceId: string, reviewerId: string, adminId: string, actor?: User) {
    if (actor && actor.role !== UserRole.ADMIN && !hasActiveGlobalReviewerAuthority(actor)) {
      throw new ForbiddenException('Only administrators or the Global Academic Reviewer can assign academic reviewers.');
    }
    const assignment = await this.resourceRepository.manager.transaction(async manager => {
      const reviewer = await manager.findOne(User, {
        where: { id: reviewerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!reviewer || !hasReviewerCapability(reviewer) || reviewer.isSuspended) {
        throw new BadRequestException('Select an active, administrator-approved academic reviewer');
      }

      const resource = await manager.findOne(Resource, {
        where: { id: resourceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!resource) throw new NotFoundException('Resource not found');
      if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
        throw new ConflictException('Only pending resources can be assigned for review');
      }
      if (resource.uploaderId === reviewer.id) throw new BadRequestException('A reviewer cannot be assigned to review their own uploaded resource.');
      if (resource.contributorUserIds?.includes(reviewer.id)) throw new BadRequestException('A reviewer cannot be assigned to review material they co-authored or contributed to.');

      if (!hasActiveGlobalReviewerAuthority(reviewer)) {
      const approvedExpertise = Array.isArray(reviewer.reviewerExpertise) ? reviewer.reviewerExpertise : [];
      const resourceExpertise = [resource.title, resource.course, resource.topic, resource.type, ...(resource.tags ?? [])]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(normalizeReviewScope);
      if (!approvedExpertise.length || !approvedExpertise.some(area => {
        const normalizedArea = normalizeReviewScope(area);
        return resourceExpertise.some(term => term === normalizedArea || term.includes(normalizedArea) || normalizedArea.includes(term));
      })) {
        throw new BadRequestException('The selected reviewer does not have an approved expertise area matching this material.');
      }

      const approvedLevels = Array.isArray(reviewer.reviewerAcademicLevels) ? reviewer.reviewerAcademicLevels : [];
      const resourceLevel = normalizeReviewScope(resource.level ?? '');
      if (!approvedLevels.length || (resourceLevel && !approvedLevels.some(level => {
        const normalizedLevel = normalizeReviewScope(level);
        return normalizedLevel === 'all' || normalizedLevel === 'all levels' || normalizedLevel.includes(resourceLevel) || resourceLevel.includes(normalizedLevel);
      }))) {
        throw new BadRequestException('The selected reviewer is not approved for this material’s academic level.');
      }
      }

      if (resource.assignedReviewerId && resource.reviewAssignmentId) {
        await manager.query(
          'INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)',
          [resource.reviewAssignmentId, resource.id, resource.assignedReviewerId, adminId, 'released'],
        );
      }
      resource.assignedReviewerId = reviewer.id;
      resource.reviewAssignmentId = randomUUID();
      const saved = await manager.save(Resource, resource);
      await manager.query(
        'INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)',
        [resource.reviewAssignmentId, resource.id, reviewer.id, adminId, 'assigned'],
      );
      return { saved, reviewer, title: resource.title };
    });

    try {
      await this.notificationsService.createNotification(
        assignment.reviewer.id,
        'resource_review_assigned',
        'A new academic resource was assigned to you',
        `“${assignment.title}” is ready for your academic review.`,
        '/moderation',
      );
    } catch (error) {
      this.logger.warn(`Resource ${resourceId} was assigned but the reviewer notification could not be created: ${String(error)}`);
    }
    return assignment.saved;
  }

  async declareConflict(id: string, dto: ReviewerConflictDeclarationDto, reviewer: User) {
    if (!hasReviewerCapability(reviewer) || reviewer.isSuspended) {
      throw new ForbiddenException('Only active, approved academic reviewers can declare assignment conflicts.');
    }
    if (dto.declaration === 'recuse' && !dto.reason?.trim()) {
      throw new BadRequestException('Provide a reason when recusing yourself from an assignment.');
    }

    const result = await this.resourceRepository.manager.transaction(async manager => {
      const reviewerRecord = await manager.findOne(User, {
        where: { id: reviewer.id },
        lock: { mode: 'pessimistic_read' },
      });
      if (!reviewerRecord || !hasReviewerCapability(reviewerRecord) || reviewerRecord.isSuspended) {
        throw new ForbiddenException('Your reviewer access is no longer active.');
      }
      const resource = await manager.findOne(Resource, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!resource) throw new NotFoundException('Resource not found');
      if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
        throw new ForbiddenException('This resource is no longer awaiting academic review.');
      }
      if (resource.assignedReviewerId !== reviewer.id || !resource.reviewAssignmentId) {
        if (!hasActiveGlobalReviewerAuthority(reviewerRecord)) {
          throw new ForbiddenException('This resource is not currently assigned to your reviewer account.');
        }
        if (resource.assignedReviewerId && resource.reviewAssignmentId) {
          await manager.query(
            'INSERT INTO reviewer_assignment_events (\"assignmentId\", \"resourceId\", \"reviewerId\", \"actorId\", \"eventType\") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)',
            [resource.reviewAssignmentId, resource.id, resource.assignedReviewerId, reviewer.id, 'released'],
          );
        }
        resource.assignedReviewerId = reviewer.id;
        resource.reviewAssignmentId = randomUUID();
        await manager.save(Resource, resource);
        await manager.query(
          'INSERT INTO reviewer_assignment_events (\"assignmentId\", \"resourceId\", \"reviewerId\", \"actorId\", \"eventType\") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)',
          [resource.reviewAssignmentId, resource.id, reviewer.id, reviewer.id, 'assigned'],
        );
      }

      const existing = await manager.query(
        'SELECT declaration FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid AND "reviewerId" = $2::uuid ORDER BY "createdAt" DESC LIMIT 1',
        [resource.reviewAssignmentId, reviewer.id],
      );
      if (existing[0]?.declaration === dto.declaration) {
        throw new ConflictException('This conflict declaration has already been recorded for the current assignment.');
      }

      const assignmentId = resource.reviewAssignmentId;
      await manager.query(
        'INSERT INTO reviewer_conflict_declarations ("assignmentId", "resourceId", "reviewerId", declaration, reason) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)',
        [assignmentId, resource.id, reviewer.id, dto.declaration, dto.reason?.trim() || null],
      );

      if (dto.declaration === 'recuse') {
        await manager.query(
          'INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)',
          [assignmentId, resource.id, reviewer.id, reviewer.id, 'recused'],
        );
        resource.assignedReviewerId = null;
        resource.reviewAssignmentId = null;
        await manager.save(Resource, resource);
      }
      return { declaration: dto.declaration, reassignmentRequired: dto.declaration === 'recuse', title: resource.title };
    });

    if (result.reassignmentRequired) {
      const admins = await this.userRepository.find({ where: { role: UserRole.ADMIN, isSuspended: false } });
      await Promise.all(admins.map(admin => this.notificationsService.createNotification(
        admin.id,
        'reviewer_recusal',
        'An academic reviewer recused from an assignment',
        `A reviewer recused from “${result.title}”. Review the declaration and assign an independent reviewer.`,
        '/moderation',
      ).catch(error => this.logger.warn(`Could not notify administrator ${admin.id} about reviewer recusal: ${String(error)}`))));
    }
    return { declaration: result.declaration, reassignmentRequired: result.reassignmentRequired };
  }

  async reviewResource(id: string, dto: ReviewResourceDto, reviewer: User) {
    if (!hasReviewerCapability(reviewer) || reviewer.isSuspended) {
      throw new ForbiddenException('Only active, approved academic reviewers can submit academic reviews.');
    }
    if (![ResourceModerationStatus.APPROVED, ResourceModerationStatus.REJECTED, ResourceModerationStatus.REVISION_REQUESTED].includes(dto.status)) {
      throw new BadRequestException('Choose approve, reject or request revision');
    }
    if ((dto.status === ResourceModerationStatus.REJECTED || dto.status === ResourceModerationStatus.REVISION_REQUESTED) && !dto.note?.trim()) {
      throw new BadRequestException('A clear reviewer note is required for rejection or revision requests');
    }

    const result = await this.resourceRepository.manager.transaction(async manager => {
      const reviewerRecord = await manager.findOne(User, {
        where: { id: reviewer.id },
        lock: { mode: 'pessimistic_read' },
      });
      if (!reviewerRecord || !hasReviewerCapability(reviewerRecord) || reviewerRecord.isSuspended) {
        throw new ForbiddenException('Your reviewer access is no longer active.');
      }
      const resource = await manager.findOne(Resource, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!resource) throw new NotFoundException('Resource not found');
      if (resource.moderationStatus !== ResourceModerationStatus.PENDING) {
        throw new ConflictException('This resource is no longer awaiting review');
      }
      if (resource.uploaderId === reviewer.id) throw new ForbiddenException('You cannot review a resource that you uploaded.');
      if (resource.contributorUserIds?.includes(reviewer.id)) throw new ForbiddenException('You cannot review material you co-authored or contributed to.');
      if (resource.assignedReviewerId !== reviewer.id || !resource.reviewAssignmentId) {
        throw new ForbiddenException('This resource is not assigned to your reviewer account');
      }

      const uploader = resource.uploaderId
        ? await manager.findOne(User, { where: { id: resource.uploaderId } })
        : null;

      const completedAssignmentId = resource.reviewAssignmentId;
      const conflictDeclaration = await manager.query(
        'SELECT declaration FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid AND "reviewerId" = $2::uuid ORDER BY "createdAt" DESC LIMIT 1',
        [completedAssignmentId, reviewer.id],
      );
      if (!conflictDeclaration.length || conflictDeclaration[0].declaration !== 'no_conflict') {
        throw new ForbiddenException('Record a no-conflict declaration before submitting an academic review.');
      }

      resource.moderationStatus = dto.status;
      resource.isVerified = dto.status === ResourceModerationStatus.APPROVED;
      resource.assignedReviewerId = null;
      resource.reviewAssignmentId = null;
      const savedResource = await manager.save(Resource, resource);
      const review = manager.create(ModerationReview, {
        resource: savedResource,
        reviewer: reviewerRecord,
        status: dto.status,
        note: dto.note?.trim() || undefined,
      });
      const savedReview = await manager.save(ModerationReview, review);
      await manager.query(
        'INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType", "reviewStatus") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6)',
        [completedAssignmentId, resource.id, reviewer.id, reviewer.id, 'completed', dto.status],
      );

      if (
        dto.status === ResourceModerationStatus.APPROVED &&
        resource.uploaderId &&
        uploader?.role === UserRole.STUDENT &&
        !uploader.isSuspended
      ) {
        await manager.save(ResourceRewardOutbox, manager.create(ResourceRewardOutbox, {
          resourceId: resource.id,
          userId: resource.uploaderId,
        }));
      }
      return { savedReview, resource, uploader };
    });

    let wisdomRewardAwarded = false;
    if (
      dto.status === ResourceModerationStatus.APPROVED &&
      Boolean(result.resource.uploaderId) &&
      result.uploader?.role === UserRole.STUDENT &&
      !result.uploader.isSuspended
    ) {
      try {
        wisdomRewardAwarded = await this.pointsService.processResourceApprovalReward(result.resource.id);
      } catch (error) {
        this.logger.error(`Resource ${result.resource.id} was approved; its Wisdom Points reward remains queued for retry: ${String(error)}`);
      }
    }

    if (result.resource.uploaderId) {
      try {
        const approved = dto.status === ResourceModerationStatus.APPROVED;
        const revisionRequested = dto.status === ResourceModerationStatus.REVISION_REQUESTED;
        await this.notificationsService.createNotification(
          result.resource.uploaderId,
          approved ? 'resource_approved' : revisionRequested ? 'resource_revision_requested' : 'resource_rejected',
          approved ? 'Your resource was approved' : revisionRequested ? 'Changes requested for your resource' : 'Your resource was rejected',
          approved
            ? `“${result.resource.title}” has been approved and is now available in the shared library.${wisdomRewardAwarded ? ' You have also earned 10 Wisdom Points.' : ''}`
            : revisionRequested
              ? `“${result.resource.title}” needs revision before it can be approved. Reviewer feedback: ${dto.note?.trim()}`
              : `“${result.resource.title}” was rejected during moderation. Reviewer note: ${dto.note?.trim()}`,
          approved ? '/library' : '/my-resources',
        );
      } catch (error) {
        this.logger.warn(`Could not create moderation notification for resource ${result.resource.id}: ${String(error)}`);
      }
    }

    try {
      const moderators = await this.userRepository.find({
        where: { role: UserRole.MODERATOR, isSuspended: false },
      });
      await Promise.all(moderators.map(moderator => this.notificationsService.createNotification(
        moderator.id,
        'resource_review_completed',
        'An academic resource review was completed',
        `A reviewer completed the review of “${result.resource.title}” with status: ${dto.status.replace(/_/g, ' ')}.`,
        '/moderation',
      )));
    } catch (error) {
      this.logger.warn(`Resource ${result.resource.id} was reviewed but moderator notifications could not be created: ${String(error)}`);
    }

    return result.savedReview;
  }


}
