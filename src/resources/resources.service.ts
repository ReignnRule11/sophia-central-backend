import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { Resource, ResourceModerationStatus, ResourceOrigin } from './entities/resource.entity';
import { SavedResource } from './entities/saved-resource.entity';
import { S3Service } from '../upload/s3.service';
import { StorageCleanupService } from '../upload/storage-cleanup.service';
import { FileUpload } from '../upload/entities/file-upload.entity';
import { UserActivityEvent } from '../analytics/entities/user-activity-event.entity';
import { ResourcePurchase } from '../payments/entities/resource-purchase.entity';
import { ResourcePricingMode } from './entities/resource.entity';
import { hasActiveGlobalReviewerAuthority } from '../users/reviewer-permissions';

function hasReviewerCapability(viewer: Partial<User>): boolean {
  return viewer.hasReviewerAccess === true || (viewer.hasReviewerAccess == null && viewer.role === UserRole.REVIEWER);
}

function isPreviewOnlyResourceAccess(viewer: Partial<User>): boolean {
  return viewer.role === UserRole.REVIEWER || hasReviewerCapability(viewer) || viewer.role === UserRole.MODERATOR || viewer.role === UserRole.ADMIN;
}

function normalizeAcademicValue(value?: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function sameAcademicValue(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeAcademicValue(left);
  return Boolean(normalizedLeft && normalizedLeft === normalizeAcademicValue(right));
}

/**
 * Department membership and a student's programme are not, by themselves,
 * evidence of a conflict. A lecturer who currently teaches the exact course
 * attached to a paid submission has a direct commercial/teaching interest and
 * must be reassigned. Student course enrolment is not structured in the current
 * account model, so paid-review preview additionally requires an assignment-
 * specific no-conflict declaration (including course-enrolment disclosure).
 */
function reviewerAcademicRole(viewer: Partial<User>): UserRole | string | undefined {
  return viewer.role === UserRole.REVIEWER
    ? (viewer.reviewerBaseRole ?? viewer.academicAccountType) ?? undefined
    : viewer.role;
}

function isLecturerUploader(viewer: Partial<User>, resource: Partial<Resource>): boolean {
  const baseRole = reviewerAcademicRole(viewer);
  return baseRole === UserRole.LECTURER
    && [UserRole.LECTURER, UserRole.REVIEWER].includes(viewer.role as UserRole)
    && Boolean(viewer.id && resource.uploaderId === viewer.id);
}

function hasPaidResourceReviewConflict(resource: Resource, viewer: Partial<User>): boolean {
  if (reviewerAcademicRole(viewer) !== UserRole.LECTURER) return false;

  return (viewer.teachingAssignments ?? []).some((assignment) =>
    sameAcademicValue(assignment.courseName, resource.course)
      || sameAcademicValue(assignment.courseCode, resource.course),
  ) || (viewer.coursesTaught ?? []).some((course) => sameAcademicValue(course, resource.course));
}

function hasAuthorisedPendingReviewContext(resource: Resource, viewer: Partial<User>): boolean {
  if (!hasReviewerCapability(viewer) || viewer.isSuspended === true
    || resource.moderationStatus !== ResourceModerationStatus.PENDING) return false;

  return resource.assignedReviewerId === viewer.id || hasActiveGlobalReviewerAuthority(viewer);
}

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly s3Service: S3Service,
    @InjectRepository(UserActivityEvent)
    private readonly activityRepository: Repository<UserActivityEvent>,
    @InjectRepository(SavedResource)
    private readonly savedResourceRepository: Repository<SavedResource>,
    @InjectRepository(ResourcePurchase)
    private readonly resourcePurchaseRepository: Repository<ResourcePurchase>,
    private readonly storageCleanup: StorageCleanupService,
  ) {}

  async create(dto: CreateResourceDto, uploaderId: string): Promise<Resource> {
    const uploader = await this.userRepository.findOne({ where: { id: uploaderId } });
    if (!uploader) throw new BadRequestException('Uploader not found');
    if (![UserRole.STUDENT, UserRole.LECTURER].includes(uploader.role)) {
      throw new ForbiddenException('Only students and lecturers can contribute resources.');
    }
    this.assertInstitutionIdentity(uploader);

    const { coAuthorHandles = [], ...resourceData } = dto;
    const normalizedCoAuthorHandles = [...new Set(coAuthorHandles.map(handle => handle.trim().replace(/^@+/, '').toLowerCase()).filter(Boolean))];
    const coAuthors = normalizedCoAuthorHandles.length
      ? await this.userRepository.createQueryBuilder('user')
        .where('LOWER(user.academicHandle) IN (:...handles)', { handles: normalizedCoAuthorHandles })
        .getMany()
      : [];
    if (coAuthors.length !== normalizedCoAuthorHandles.length) {
      throw new BadRequestException('One or more co-author academic handles could not be matched to an existing Sophis Central account. Check the handles or omit external co-authors.');
    }

    const resource = this.resourceRepository.create({
      ...resourceData,
      contributorUserIds: coAuthors.map(author => author.id),
      uploader,
      uploaderId,
      uploaderInstitutionId: uploader.institutionId ?? null,
      // Uploads always enter moderation; clients cannot publish directly.
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
    });

    return this.resourceRepository.save(resource);
  }

  /**
   * Students and lecturers browse approved resources only. Moderators and admins have
   * platform-wide visibility for resource oversight; reviewers use assigned review access.
   */
  async findVisibleTo(viewer: User): Promise<Resource[]> {
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to resources.');
    }
    if (viewer.role === UserRole.REVIEWER && !hasReviewerCapability(viewer)) {
      throw new ForbiddenException('Your academic reviewer access is no longer active.');
    }

    // Only moderators and admins receive platform-wide resource visibility.
    // Reviewers use the assigned-review queue; their shared library remains approved-only.
    const resources = await this.resourceRepository.find({
      where: { origin: ResourceOrigin.COMMUNITY_UPLOAD, ...([UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role) ? {} : { moderationStatus: ResourceModerationStatus.APPROVED }) },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
    // Do not expose storage URLs in list responses; file access must go through the authorized file endpoints.
    return resources.map((resource) => ({ ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined }) as Resource);
  }

  private assertInstitutionIdentity(viewer: User): void {
    if ([UserRole.STUDENT, UserRole.LECTURER].includes(viewer.role) && !viewer.institutionId) {
      throw new ForbiddenException('Complete your catalogue-backed institution setup before uploading or downloading academic materials.');
    }
  }

  private assertCanSave(viewer: User): void {
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to personal resources.');
    }
    if (viewer.role === UserRole.REVIEWER && !hasReviewerCapability(viewer)) {
      throw new ForbiddenException('Your academic reviewer access is no longer active.');
    }
  }

  async findSavedForUser(viewer: User): Promise<Resource[]> {
    this.assertCanSave(viewer);
    const savedEntries = await this.savedResourceRepository.find({
      where: { userId: viewer.id, isSaved: true, resource: { moderationStatus: ResourceModerationStatus.APPROVED } },
      relations: ['resource', 'resource.uploader'],
      order: { createdAt: 'DESC' },
    });
    return savedEntries.map(({ resource, createdAt }) => ({
      ...resource,
      savedAt: createdAt,
      hasFile: Boolean(resource.fileUrl),
      fileUrl: undefined,
    }) as Resource);
  }

  async findDownloadedForUser(viewer: User): Promise<Resource[]> {
    this.assertCanSave(viewer);
    this.assertInstitutionIdentity(viewer);
    const entries = await this.savedResourceRepository.find({
      where: { userId: viewer.id, downloadedAt: Not(IsNull()), resource: { moderationStatus: ResourceModerationStatus.APPROVED } },
      relations: ['resource', 'resource.uploader'],
      order: { downloadedAt: 'DESC' },
    });
    return entries.map(({ resource, downloadedAt }) => ({ ...resource, downloadedAt, hasFile: Boolean(resource.fileUrl), fileUrl: undefined }) as Resource);
  }

  async saveForUser(id: string, viewer: User): Promise<{ saved: true; resourceId: string }> {
    this.assertCanSave(viewer);
    const resource = await this.findOneForViewer(id, viewer, false);
    if (resource.moderationStatus !== ResourceModerationStatus.APPROVED) {
      throw new NotFoundException('Approved resource not found');
    }

    const existing = await this.savedResourceRepository.findOne({ where: { userId: viewer.id, resourceId: id } });
    if (!existing) {
      await this.savedResourceRepository.save(this.savedResourceRepository.create({ userId: viewer.id, resourceId: id, user: viewer, resource, downloadedAt: null, isSaved: true }));
    } else if (!existing.isSaved) {
      existing.isSaved = true;
      await this.savedResourceRepository.save(existing);
    }
    return { saved: true, resourceId: id };
  }

  private async assertPaidResourceAccess(resource: Resource, viewer: User): Promise<void> {
    if (resource.pricingMode === ResourcePricingMode.FREE) return;
    if (resource.uploaderId === viewer.id || [UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) return;

    // Reviewer access is an exception for an active pending-review assignment only.
    // It must never grant free preview of an approved paid item in the ordinary library.
    if (hasAuthorisedPendingReviewContext(resource, viewer)) {
      if (hasPaidResourceReviewConflict(resource, viewer)) {
        throw new ForbiddenException('Recuse yourself and request reassignment. You currently teach this exact course and cannot access this paid review document.');
      }
      if (!resource.reviewAssignmentId) {
        throw new ForbiddenException('Record an assignment-specific no-conflict declaration before previewing this paid review document.');
      }
      const declaration = await this.resourceRepository.manager.query(
        'SELECT declaration FROM reviewer_conflict_declarations WHERE "assignmentId" = $1::uuid AND "reviewerId" = $2::uuid ORDER BY "createdAt" DESC LIMIT 1',
        [resource.reviewAssignmentId, viewer.id],
      );
      if (declaration[0]?.declaration !== 'no_conflict') {
        throw new ForbiddenException('Record a no-conflict declaration before previewing this paid review document. If you are enrolled in its course or have another competing interest, recuse yourself.');
      }
      return;
    }

    const purchase = await this.resourcePurchaseRepository.findOne({ where: { userId: viewer.id, resourceId: resource.id } });
    if (!purchase) throw new ForbiddenException('Purchase this resource before accessing its file.');
  }

  async downloadForUser(id: string, viewer: User): Promise<{ downloaded: true; resourceId: string }> {
    this.assertCanSave(viewer);
    this.assertInstitutionIdentity(viewer);
    const resource = await this.findOneForViewer(id, viewer, false);
    const lecturerUploader = isLecturerUploader(viewer, resource);
    if (isPreviewOnlyResourceAccess(viewer) && !lecturerUploader) {
      throw new ForbiddenException('Academic reviewers and platform oversight accounts can preview authorised resources but cannot download them. Only a lecturer may download their own upload.');
    }
    const ownUpload = resource.uploaderId === viewer.id;
    await this.assertPaidResourceAccess(resource, viewer);
    if (resource.moderationStatus !== ResourceModerationStatus.APPROVED && !ownUpload && ![UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) throw new NotFoundException('Approved resource not found');
    if (resource.downloadRestricted && !ownUpload && ![UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) throw new ForbiddenException('Downloads are disabled for this resource.');
    // findOneForViewer deliberately strips private storage URLs from its response.
    // Re-read the entity server-side before checking attachment presence/updating counters.
    const stored = await this.resourceRepository.findOne({ where: { id } });
    if (!stored?.fileUrl) throw new NotFoundException('Resource file not found');
    let entry = await this.savedResourceRepository.findOne({ where: { userId: viewer.id, resourceId: id } });
    const now = new Date();
    if (!entry) entry = this.savedResourceRepository.create({ userId: viewer.id, resourceId: id, user: viewer, resource, downloadedAt: now, isSaved: false });
    else if (!entry.downloadedAt) entry.downloadedAt = now;
    await this.savedResourceRepository.save(entry);
    stored.downloads = Number(stored.downloads || 0) + 1;
    await this.resourceRepository.save(stored);
    await this.activityRepository.save(this.activityRepository.create({ userId: viewer.id, institutionId: viewer.institutionId ?? null, eventType: 'download', resourceId: id }));
    return { downloaded: true, resourceId: id };
  }

  async removeSavedForUser(id: string, viewer: User): Promise<{ saved: false; resourceId: string }> {
    this.assertCanSave(viewer);
    const entry = await this.savedResourceRepository.findOne({ where: { userId: viewer.id, resourceId: id } });
    if (entry) {
      entry.isSaved = false;
      if (!entry.downloadedAt) await this.savedResourceRepository.remove(entry);
      else await this.savedResourceRepository.save(entry);
    }
    return { saved: false, resourceId: id };
  }

  async findMine(uploaderId: string): Promise<Resource[]> {
    const resources = await this.resourceRepository.find({
      where: { uploaderId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
    return resources.map((resource) => ({ ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined }) as Resource);
  }

  async findOneForViewer(id: string, viewer: User, trackView = true): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { id, origin: ResourceOrigin.COMMUNITY_UPLOAD },
      relations: ['uploader'],
    });

    if (!resource) throw new NotFoundException('Resource not found');

    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER, UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }
    if (viewer.role === UserRole.REVIEWER && !hasReviewerCapability(viewer)) {
      throw new ForbiddenException('Your academic reviewer access is no longer active.');
    }

    const isPlatformModerator = [UserRole.MODERATOR, UserRole.ADMIN].includes(viewer.role);
    const reviewerCapability = hasReviewerCapability(viewer);
    const isAssignedReviewer = reviewerCapability && !viewer.isSuspended && resource.assignedReviewerId === viewer.id;
    const isGlobalReviewer = hasActiveGlobalReviewerAuthority(viewer) && resource.moderationStatus === ResourceModerationStatus.PENDING;
    const hasModerationAccess = isPlatformModerator || isAssignedReviewer || isGlobalReviewer;
    const isUploader = resource.uploaderId === viewer.id;

    // Contributors may inspect their own submissions (including pending/rejected
    // moderation states). Other students/lecturers must only see approved items.
    // Reviewers may inspect only resources assigned to them; moderators/admins have platform oversight.
    if (!hasModerationAccess && !isUploader &&
        resource.moderationStatus !== ResourceModerationStatus.APPROVED) {
      // Do not disclose whether another contributor's private resource exists.
      throw new NotFoundException('Resource not found');
    }

    if (trackView) {
      resource.views = Number(resource.views || 0) + 1;
      await this.resourceRepository.save(resource);
      await this.activityRepository.save(this.activityRepository.create({ userId: viewer.id, eventType: 'view', resourceId: resource.id }));
    }
    // Keep storage URLs private; the reader asks the authenticated file endpoint for temporary access.
    return { ...resource, hasFile: Boolean(resource.fileUrl), fileUrl: undefined } as Resource;
  }

  async getReaderFile(id: string, viewer: User): Promise<{ body: NodeJS.ReadableStream; filename: string; contentType: string; contentLength?: number }> {
    this.assertInstitutionIdentity(viewer);
    const authorizedResource = await this.findOneForViewer(id, viewer, false);
    await this.assertPaidResourceAccess(authorizedResource, viewer);
    if (!hasReviewerCapability(viewer) && [UserRole.STUDENT, UserRole.LECTURER].includes(viewer.role) && authorizedResource.uploaderId !== viewer.id) {
      const entry = await this.savedResourceRepository.findOne({ where: { userId: viewer.id, resourceId: id } });
      if (!entry?.downloadedAt) throw new ForbiddenException('Save this resource to My Resources before viewing it.');
    }
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource?.fileUrl) throw new NotFoundException('Resource file not found');
    const key = this.s3Service.getKeyFromPublicUrl(resource.fileUrl);
    if (!key) throw new ForbiddenException('This file is not stored in the authorized private storage.');
    const extension = key.split('.').pop()?.toLowerCase();
    const supportedTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain; charset=utf-8',
    };
    if (!extension || !supportedTypes[extension]) {
      throw new ForbiddenException('Secure in-app preview supports PDF, Word, PowerPoint, and plain-text documents only.');
    }
    const file = await this.s3Service.getObjectStream(key);
    await this.activityRepository.save(this.activityRepository.create({
      userId: viewer.id,
      institutionId: viewer.institutionId ?? null,
      eventType: 'file_access',
      resourceId: resource.id,
    }));
    const safeTitle = Array.from(resource.title || 'resource').filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').replace(/[:*?"<>|]/g, '-').split('/').join('-').split('\\\\').join('-').trim() || 'resource';
    return {
      body: file.body,
      filename: `${safeTitle}.${extension}`,
      contentType: supportedTypes[extension],
      contentLength: file.contentLength,
    };
  }

  async update(id: string, dto: UpdateResourceDto): Promise<Resource> {
    return this.resourceRepository.manager.transaction(async manager => {
      const resource = await manager.findOne(Resource, { where: { id } });
      if (!resource) throw new NotFoundException('Resource not found');
      const previousFileUrl = resource.fileUrl;
      Object.assign(resource, dto);
      const saved = await manager.save(Resource, resource);
      if (previousFileUrl && previousFileUrl !== saved.fileUrl) {
        await this.storageCleanup.enqueueWithManager(manager, previousFileUrl, 'resource-file-replaced');
      }
      return saved;
    });
  }

  async remove(id: string): Promise<void> {
    await this.resourceRepository.manager.transaction(async manager => {
      const resource = await manager.findOne(Resource, { where: { id } });
      if (!resource) throw new NotFoundException('Resource not found');

      const uploads = await manager.find(FileUpload, { where: { resourceId: id } });
      const legacyFiles = await manager.query('SELECT s3_key FROM resource_files WHERE resource_id = $1::uuid', [id]);
      await this.storageCleanup.enqueueWithManager(manager, resource.fileUrl, 'resource-deleted');
      for (const upload of uploads) {
        await this.storageCleanup.enqueueWithManager(manager, upload.s3Key, 'resource-upload-deleted');
      }
      for (const legacyFile of legacyFiles) {
        await this.storageCleanup.enqueueWithManager(manager, legacyFile.s3_key, 'legacy-resource-file-deleted');
      }
      await manager.query('DELETE FROM resource_files WHERE resource_id = $1::uuid', [id]);

      await manager.remove(Resource, resource);
    });
  }

  async findByFilters(query: Partial<Pick<Resource, 'course' | 'topic' | 'institution' | 'level' | 'type'>>) {
    const qb = this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoinAndSelect('resource.uploader', 'uploader')
      .where('resource.moderationStatus = :status', {
        status: ResourceModerationStatus.APPROVED,
      });

    if (query.course) {
      qb.andWhere('LOWER(resource.course) LIKE LOWER(:course)', { course: `%${query.course}%` });
    }
    if (query.topic) {
      qb.andWhere('LOWER(resource.topic) LIKE LOWER(:topic)', { topic: `%${query.topic}%` });
    }
    if (query.institution) {
      qb.andWhere('LOWER(resource.institution) LIKE LOWER(:institution)', { institution: `%${query.institution}%` });
    }
    if (query.level) {
      qb.andWhere('LOWER(resource.level) LIKE LOWER(:level)', { level: `%${query.level}%` });
    }
    if (query.type) qb.andWhere('resource.type = :type', { type: query.type });

    return qb.orderBy('resource.createdAt', 'DESC').getMany();
  }
}
