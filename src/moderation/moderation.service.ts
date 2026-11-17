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
import { ResourceReviewAppeal } from './entities/resource-review-appeal.entity';
import { ResourceReviewAppealDecision } from './entities/resource-review-appeal-decision.entity';
import { CreateResourceAppealDto } from './dto/create-resource-appeal.dto';
import { DecideResourceAppealDto } from './dto/decide-resource-appeal.dto';

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
    @InjectRepository(ResourceReviewAppeal)
    private readonly appealRepository: Repository<ResourceReviewAppeal>,
    @InjectRepository(ResourceReviewAppealDecision)
    private readonly appealDecisionRepository: Repository<ResourceReviewAppealDecision>,
    private readonly notificationsService: NotificationsService,
    private readonly pointsService: PointsService,
  ) {}

  async getQueue(viewer: User) {
    if (viewer.role !== UserRole.ADMIN && !hasReviewerCapability(viewer)) {
      throw new ForbiddenException('Only approved academic reviewers and admins can access the academic resource queue.');
    }
    if (hasReviewerCapability(viewer) && viewer.isSuspended) return [];
    const queue = await this.resourceRepository.find({
      where: viewer.role === UserRole.ADMIN
        ? { moderationStatus: ResourceModerationStatus.PENDING }
        : { moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: viewer.id },
      relations: ['uploader', 'assignedReviewer'],
      order: { createdAt: 'ASC' },
    });
    if (viewer.role !== UserRole.ADMIN) {
      for (const resource of queue) {
        if (!resource.reviewAssignmentId) { resource.reviewConflictDeclaration = null; continue; }
        const rows = await this.resourceRepository.manager.query(
          'SELECT declaration FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid AND "reviewerId" = $2::uuid ORDER BY "createdAt" DESC LIMIT 1',
          [resource.reviewAssignmentId, viewer.id],
        );
        resource.reviewConflictDeclaration = rows[0]?.declaration ?? null;
      }
    }
    return queue;
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

  async createAppeal(resourceId: string, appellant: User, dto: CreateResourceAppealDto) {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException('Resource not found.');
    if (resource.uploaderId !== appellant.id) throw new ForbiddenException('Only the original uploader can request reconsideration of this resource.');
    if (![ResourceModerationStatus.REJECTED, ResourceModerationStatus.REVISION_REQUESTED].includes(resource.moderationStatus)) {
      throw new BadRequestException('Only rejected or revision-requested resources can be appealed.');
    }
    const originalReview = await this.moderationReviewRepository.findOne({
      where: { resourceId },
      order: { createdAt: 'DESC' },
    });
    if (!originalReview) throw new BadRequestException('There is no completed reviewer decision to appeal.');
    if (!originalReview.reviewerId) throw new BadRequestException('The original reviewer identity is no longer available for an independent appeal review.');
    const pending = await this.appealRepository.findOne({
      where: [{ resourceId, appellantId: appellant.id, status: 'submitted' }, { resourceId, appellantId: appellant.id, status: 'under_review' }],
    });
    if (pending) throw new ConflictException('A reconsideration request is already open for this resource.');
    const appeal = await this.appealRepository.save(this.appealRepository.create({
      resourceId,
      appellantId: appellant.id,
      originalReviewId: originalReview.id,
      originalReviewerId: originalReview.reviewerId,
      appealType: dto.appealType,
      reason: dto.reason.trim(),
      status: 'submitted',
    }));
    const admins = await this.userRepository.find({ where: { role: UserRole.ADMIN, isSuspended: false } });
    await Promise.all(admins.map(admin => this.notificationsService.createNotification(
      admin.id,
      'resource_review_appeal',
      'A resource review appeal was submitted',
      `A reconsideration request was submitted for “${resource.title}”. Review it independently.`,
      '/moderation?tab=appeals',
    ).catch(error => this.logger.warn(`Could not notify administrator ${admin.id} about resource appeal: ${String(error)}`))));
    return appeal;
  }

  async getMyAppeals(appellant: User) {
    return this.appealRepository.find({ where: { appellantId: appellant.id }, order: { createdAt: 'DESC' } });
  }

  async getAppeals(admin: User) {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Only administrators can inspect resource appeals.');
    return this.resourceRepository.manager.query(`
      SELECT a."id", a."resourceId", a."appellantId", a."originalReviewId", a."originalReviewerId",
             a."appealType", a."reason", a."status", a."createdAt", a."updatedAt",
             r."title" AS "resourceTitle", u."firstName" AS "appellantFirstName",
             u."lastName" AS "appellantLastName", u."email" AS "appellantEmail",
             reviewer."firstName" AS "originalReviewerFirstName", reviewer."lastName" AS "originalReviewerLastName"
      FROM "resource_review_appeals" a
      JOIN "resources" r ON r."id" = a."resourceId"
      JOIN "users" u ON u."id" = a."appellantId"
      JOIN "users" reviewer ON reviewer."id" = a."originalReviewerId"
      ORDER BY a."createdAt" DESC
      LIMIT 250
    `);
  }

  async decideAppeal(appealId: string, admin: User, dto: DecideResourceAppealDto) {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Only administrators can decide resource appeals.');
    const appeal = await this.appealRepository.findOne({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException('Resource appeal not found.');
    if (admin.id === appeal.appellantId || admin.id === appeal.originalReviewerId) {
      throw new ForbiddenException('An administrator involved in the original upload or review cannot investigate this appeal.');
    }
    if (!['submitted', 'under_review'].includes(appeal.status)) throw new ConflictException('This appeal has already been decided.');
    if (dto.status !== 'under_review' && !dto.note?.trim()) {
      throw new BadRequestException('Provide a reason for accepting or rejecting an appeal.');
    }
    await this.appealDecisionRepository.save(this.appealDecisionRepository.create({
      appealId: appeal.id,
      actorId: admin.id,
      fromStatus: appeal.status,
      toStatus: dto.status,
      note: dto.note?.trim() || null,
    }));
    appeal.status = dto.status;
    await this.appealRepository.save(appeal);

    if (dto.status === 'accepted') {
      const resource = await this.resourceRepository.findOne({ where: { id: appeal.resourceId } });
      if (resource) {
        resource.moderationStatus = ResourceModerationStatus.PENDING;
        resource.isVerified = false;
        resource.assignedReviewerId = null;
        resource.reviewAssignmentId = null;
        await this.resourceRepository.save(resource);
      }
    }
    const resource = await this.resourceRepository.findOne({ where: { id: appeal.resourceId } });
    await this.notificationsService.createNotification(
      appeal.appellantId,
      'resource_review_appeal_decision',
      dto.status === 'accepted' ? 'Your appeal was accepted' : dto.status === 'rejected' ? 'Your appeal was not accepted' : 'Your appeal is under review',
      dto.status === 'accepted'
        ? `Your appeal was accepted. “${resource?.title || 'Your resource'}” has been returned to the review queue for an independent reassessment.`
        : dto.note?.trim() || 'An administrator has updated the status of your reconsideration request.',
      '/my-resources',
    );
    return appeal;
  }

  async getAppealDecisionHistory(appealId: string, admin: User) {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Only administrators can inspect appeal decision history.');
    if (!await this.appealRepository.findOne({ where: { id: appealId }, select: ['id'] })) throw new NotFoundException('Resource appeal not found.');
    return this.appealDecisionRepository.find({ where: { appealId }, order: { createdAt: 'ASC' } });
  }

  async getConflictDeclarations(viewer: User) {
    if (viewer.role !== UserRole.ADMIN) throw new ForbiddenException('Only administrators can inspect reviewer conflict declarations.');
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
      where: viewer.role === UserRole.ADMIN ? {} : { reviewer: { id: viewer.id } },
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
    if (!reviewer || !hasReviewerCapability(reviewer) || reviewer.isSuspended) {
      throw new BadRequestException('Select an active, administrator-approved academic reviewer');
    }
    if (resource.uploaderId === reviewer.id) throw new BadRequestException('A reviewer cannot be assigned to review their own uploaded resource.');
    if (resource.contributorUserIds?.includes(reviewer.id)) throw new BadRequestException('A reviewer cannot be assigned to review material they co-authored or contributed to.');
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
    resource.assignedReviewerId = reviewer.id;
    resource.reviewAssignmentId = randomUUID();
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

  async declareConflict(id: string, dto: ReviewerConflictDeclarationDto, reviewer: User) {
    if (!hasReviewerCapability(reviewer) || reviewer.isSuspended) {
      throw new ForbiddenException('Only active, approved academic reviewers can declare assignment conflicts.');
    }
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.moderationStatus !== ResourceModerationStatus.PENDING || resource.assignedReviewerId !== reviewer.id || !resource.reviewAssignmentId) {
      throw new ForbiddenException('This resource is not currently assigned to your reviewer account.');
    }
    if (dto.declaration === 'recuse' && !dto.reason?.trim()) {
      throw new BadRequestException('Provide a reason when recusing yourself from an assignment.');
    }
    const existing = await this.resourceRepository.manager.query(
      'SELECT declaration FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid ORDER BY "createdAt" DESC LIMIT 1',
      [resource.reviewAssignmentId],
    );
    if (existing[0]?.declaration === dto.declaration) throw new ConflictException('This conflict declaration has already been recorded for the current assignment.');

    await this.resourceRepository.manager.query(
      'INSERT INTO reviewer_conflict_declarations ("assignmentId", "resourceId", "reviewerId", declaration, reason) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)',
      [resource.reviewAssignmentId, resource.id, reviewer.id, dto.declaration, dto.reason?.trim() || null],
    );

    if (dto.declaration === 'recuse') {
      resource.assignedReviewerId = null;
      resource.reviewAssignmentId = null;
      await this.resourceRepository.save(resource);
      const admins = await this.userRepository.find({ where: { role: UserRole.ADMIN, isSuspended: false } });
      await Promise.all(admins.map(admin => this.notificationsService.createNotification(
        admin.id,
        'reviewer_recusal',
        'An academic reviewer recused from an assignment',
        `A reviewer recused from “${resource.title}”. Review the declaration and assign an independent reviewer.`,
        '/moderation',
      ).catch(error => this.logger.warn(`Could not notify administrator ${admin.id} about reviewer recusal: ${String(error)}`))));
      return { declaration: dto.declaration, reassignmentRequired: true };
    }
    return { declaration: dto.declaration, reassignmentRequired: false };
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
    if (!hasReviewerCapability(reviewer)) {
      throw new ForbiddenException('Only an assigned academic reviewer can approve, reject or request revisions.');
    }
    if (resource.uploaderId === reviewer.id) throw new ForbiddenException('You cannot review a resource that you uploaded.');
    if (resource.contributorUserIds?.includes(reviewer.id)) throw new ForbiddenException('You cannot review material you co-authored or contributed to.');
    if (reviewer.isSuspended) {
      throw new ForbiddenException('Suspended reviewer accounts cannot access the review workflow');
    }
    if (resource.assignedReviewerId !== reviewer.id || !resource.reviewAssignmentId) {
      throw new ForbiddenException('This resource is not assigned to your reviewer account');
    }
    const conflictDeclaration = await this.resourceRepository.manager.query(
      'SELECT id FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid AND "reviewerId" = $2::uuid ORDER BY "createdAt" DESC LIMIT 1',
      [resource.reviewAssignmentId, reviewer.id],
    );
    if (!conflictDeclaration.length || conflictDeclaration[0].declaration !== 'no_conflict') {
      throw new ForbiddenException('Record a no-conflict declaration before submitting an academic review.');
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
    resource.reviewAssignmentId = null;

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
        resource.uploaderId &&
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
      Boolean(resource.uploaderId) &&
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

    if (resource.uploaderId) {
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
    }

    if (hasReviewerCapability(reviewer)) {
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
