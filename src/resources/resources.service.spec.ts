import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { ResourceModerationStatus, ResourceOrigin, ResourcePricingMode } from './entities/resource.entity';
import { UserRole } from '../users/entities/user.entity';

describe('ResourcesService.findOneForViewer authorization', () => {
  const resourceRepository: any = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    manager: { query: jest.fn().mockResolvedValue([{ declaration: 'no_conflict' }]) },
  };
  const activityRepository: any = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const resourcePurchaseRepository: any = { findOne: jest.fn().mockResolvedValue(null) };
  const storageCleanup: any = { enqueueWithManager: jest.fn() };
  const service = new ResourcesService(
    resourceRepository,
    {} as any,
    {} as any,
    activityRepository,
    {} as any,
    resourcePurchaseRepository,
    storageCleanup,
  );

  const resource = (overrides: Record<string, unknown> = {}) => ({
    id: 'resource-1',
    title: 'Test contribution',
    uploaderId: 'student-owner',
    moderationStatus: ResourceModerationStatus.PENDING,
    fileUrl: 'https://storage.example.test/private/test.pdf',
    pricingMode: ResourcePricingMode.FREE,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a student to inspect their own pending submission', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    const result = await service.findOneForViewer('resource-1', {
      id: 'student-owner', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any, false);

    expect(result).toMatchObject({ id: 'resource-1', hasFile: true });
    expect(result.fileUrl).toBeUndefined();
    expect(resourceRepository.findOne).toHaveBeenCalledWith({ where: { id: 'resource-1', origin: ResourceOrigin.COMMUNITY_UPLOAD }, relations: ['uploader'] });
  });

  it('allows a student to inspect their own rejected submission and its file metadata', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({
      moderationStatus: ResourceModerationStatus.REJECTED,
    }));
    const result = await service.findOneForViewer('resource-1', {
      id: 'student-owner', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any, false);

    expect(result.moderationStatus).toBe(ResourceModerationStatus.REJECTED);
    expect((result as typeof result & { hasFile?: boolean }).hasFile).toBe(true);
  });

  it('does not expose another contributor\'s pending resource to a student', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'other-student', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any, false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([UserRole.REVIEWER, UserRole.MODERATOR, UserRole.ADMIN])('does not allow %s to download resources', async (role) => {
    resourceRepository.findOne.mockResolvedValue(resource({ moderationStatus: ResourceModerationStatus.APPROVED }));
    const savedRepository: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const downloadService = new ResourcesService(resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup);
    await expect(downloadService.downloadForUser('resource-1', { id: 'privileged-1', role } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(resourceRepository.findOne).toHaveBeenCalledTimes(1);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('does not allow a student with reviewer access to download resources', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ moderationStatus: ResourceModerationStatus.APPROVED }));
    const savedRepository: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const downloadService = new ResourcesService(resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup);
    await expect(downloadService.downloadForUser('resource-1', {
      id: 'dual-role-reviewer', role: UserRole.STUDENT, hasReviewerAccess: true, institutionId: 'institution-1',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(resourceRepository.findOne).toHaveBeenCalledTimes(1);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('allows a student to download their own pending contribution', async () => {
    const pending = resource();
    resourceRepository.findOne
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending);
    const savedRepository: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const downloadService = new ResourcesService(
      resourceRepository,
      {} as any,
      {} as any,
      activityRepository,
      savedRepository,
      resourcePurchaseRepository,
      storageCleanup,
    );

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'student-owner', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any)).resolves.toEqual({ downloaded: true, resourceId: 'resource-1' });

    expect(savedRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'student-owner', resourceId: 'resource-1', downloadedAt: expect.any(Date),
    }));
  });

  it('preserves full download access for a lecturer reviewer on their own upload', async () => {
    const pending = resource({ downloadRestricted: true });
    resourceRepository.findOne.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending);
    const savedRepository: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const downloadService = new ResourcesService(
      resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup,
    );

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'student-owner', role: UserRole.LECTURER, hasReviewerAccess: true, institutionId: 'institution-1',
    } as any)).resolves.toEqual({ downloaded: true, resourceId: 'resource-1' });
    expect(savedRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'student-owner', resourceId: 'resource-1', downloadedAt: expect.any(Date),
    }));
  });

  it('does not allow a student to download another contributor pending contribution', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    const savedRepository: any = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const downloadService = new ResourcesService(
      resourceRepository,
      {} as any,
      {} as any,
      activityRepository,
      savedRepository,
      resourcePurchaseRepository,
      storageCleanup,
    );

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'other-student', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('allows a student to view another contributor\'s approved resource', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({
      moderationStatus: ResourceModerationStatus.APPROVED,
    }));
    await expect(service.findOneForViewer('resource-1', {
      id: 'other-student', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('allows a lecturer to inspect their own pending submission', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'student-owner', role: UserRole.LECTURER, institutionId: 'institution-1',
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('does not expose another lecturer\'s pending resource to a lecturer', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'other-lecturer', role: UserRole.LECTURER, institutionId: 'institution-1',
    } as any, false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([UserRole.MODERATOR, UserRole.ADMIN])('allows %s to inspect pending submissions', async (role) => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'reviewer-1', role,
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('allows only the assigned reviewer to inspect a pending submission', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ assignedReviewerId: 'reviewer-1' }));
    await expect(service.findOneForViewer('resource-1', { id: 'reviewer-1', role: UserRole.REVIEWER, isSuspended: false } as any, false))
      .resolves.toMatchObject({ id: 'resource-1' });
    resourceRepository.findOne.mockResolvedValue(resource({ assignedReviewerId: 'reviewer-2' }));
    await expect(service.findOneForViewer('resource-1', { id: 'reviewer-1', role: UserRole.REVIEWER, isSuspended: false } as any, false))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a dual-role student reviewer to inspect their assigned pending submission', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ assignedReviewerId: 'reviewer-1' }));
    await expect(service.findOneForViewer('resource-1', {
      id: 'reviewer-1', role: UserRole.STUDENT, hasReviewerAccess: true, institutionId: 'institution-1', isSuspended: false,
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('allows an active Global Academic Reviewer to inspect pending queue items assigned to another reviewer', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ assignedReviewerId: 'assigned-reviewer' }));
    await expect(service.findOneForViewer('resource-1', {
      id: 'global-reviewer', role: UserRole.REVIEWER, hasReviewerAccess: true, isGlobalReviewer: true,
      reviewerStatus: 'approved', isSuspended: false, accountStatus: 'active',
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('rejects a reviewer-role account whose reviewer access has been revoked', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ moderationStatus: ResourceModerationStatus.APPROVED }));
    await expect(service.findOneForViewer('resource-1', {
      id: 'revoked-reviewer', role: UserRole.REVIEWER, hasReviewerAccess: false,
    } as any, false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant a student reviewer free preview of an approved paid library resource', async () => {
    const paid = resource({ moderationStatus: ResourceModerationStatus.APPROVED, pricingMode: ResourcePricingMode.FIXED, uploaderId: 'lecturer-1' });
    resourceRepository.findOne.mockResolvedValue(paid);
    resourcePurchaseRepository.findOne.mockResolvedValue(null);
    const s3 = { getKeyFromPublicUrl: jest.fn(), getObjectStream: jest.fn() };
    const previewService = new ResourcesService(resourceRepository, {} as any, s3 as any, activityRepository, {} as any, resourcePurchaseRepository, storageCleanup);

    await expect(previewService.getReaderFile('resource-1', {
      id: 'student-reviewer', role: UserRole.STUDENT, hasReviewerAccess: true, institutionId: 'institution-1',
    } as any)).rejects.toThrow('Purchase this resource before accessing its file.');
    expect(s3.getObjectStream).not.toHaveBeenCalled();
  });

  it('does not treat a student programme or shared department as an automatic conflict when a no-conflict declaration exists', async () => {
    const paid = resource({
      moderationStatus: ResourceModerationStatus.PENDING,
      pricingMode: ResourcePricingMode.FIXED,
      uploaderId: 'lecturer-1',
      department: 'Computer Science',
      course: 'CSC 301',
      assignedReviewerId: 'student-reviewer',
      reviewAssignmentId: 'assignment-1',
    });
    resourceRepository.findOne.mockResolvedValue(paid);
    const s3 = {
      getKeyFromPublicUrl: jest.fn().mockReturnValue('resources/review.pdf'),
      getObjectStream: jest.fn().mockResolvedValue({ body: { pipe: jest.fn(), on: jest.fn() }, contentLength: 1024 }),
    };
    const previewService = new ResourcesService(resourceRepository, {} as any, s3 as any, activityRepository, {} as any, resourcePurchaseRepository, storageCleanup);

    await expect(previewService.getReaderFile('resource-1', {
      id: 'student-reviewer', role: UserRole.STUDENT, hasReviewerAccess: true, institutionId: 'institution-1',
      department: 'Computer Science', program: 'Computer Science',
    } as any)).resolves.toMatchObject({ contentType: 'application/pdf' });
    expect(s3.getObjectStream).toHaveBeenCalledWith('resources/review.pdf');
    expect(resourceRepository.manager.query).toHaveBeenCalledWith(expect.stringContaining('reviewer_conflict_declarations'), ['assignment-1', 'student-reviewer']);
  });

  it('allows a conflict-free assigned student reviewer to preview a paid pending document without creating a purchase', async () => {
    const paid = resource({
      moderationStatus: ResourceModerationStatus.PENDING,
      pricingMode: ResourcePricingMode.FIXED,
      uploaderId: 'lecturer-1',
      department: 'Physics',
      course: 'PHY 401',
      assignedReviewerId: 'student-reviewer',
      reviewAssignmentId: 'assignment-1',
    });
    resourceRepository.findOne.mockResolvedValue(paid);
    const s3 = {
      getKeyFromPublicUrl: jest.fn().mockReturnValue('resources/review.pdf'),
      getObjectStream: jest.fn().mockResolvedValue({ body: { pipe: jest.fn(), on: jest.fn() }, contentLength: 1024 }),
    };
    const purchaseRepository: any = { findOne: jest.fn().mockResolvedValue(null) };
    const previewService = new ResourcesService(resourceRepository, {} as any, s3 as any, activityRepository, {} as any, purchaseRepository, storageCleanup);

    await expect(previewService.getReaderFile('resource-1', {
      id: 'student-reviewer', role: UserRole.STUDENT, hasReviewerAccess: true, institutionId: 'institution-1',
      department: 'Computer Science', program: 'Computer Science',
      isSuspended: false,
    } as any)).resolves.toMatchObject({ contentType: 'application/pdf' });
    expect(purchaseRepository.findOne).not.toHaveBeenCalled();
    expect(s3.getObjectStream).toHaveBeenCalledWith('resources/review.pdf');
  });

  it('requires a lecturer reviewer to recuse from a paid review for a course they teach', async () => {
    const paid = resource({
      moderationStatus: ResourceModerationStatus.PENDING,
      pricingMode: ResourcePricingMode.FIXED,
      uploaderId: 'another-lecturer',
      department: 'Engineering',
      course: 'ENG 402',
      assignedReviewerId: 'lecturer-reviewer',
    });
    resourceRepository.findOne.mockResolvedValue(paid);
    const s3 = { getKeyFromPublicUrl: jest.fn(), getObjectStream: jest.fn() };
    const previewService = new ResourcesService(resourceRepository, {} as any, s3 as any, activityRepository, {} as any, resourcePurchaseRepository, storageCleanup);

    await expect(previewService.getReaderFile('resource-1', {
      id: 'lecturer-reviewer', role: UserRole.LECTURER, hasReviewerAccess: true, institutionId: 'institution-1',
      department: 'Mathematics', teachingAssignments: [{ courseName: 'ENG 402', levels: ['400'] }],
    } as any)).rejects.toThrow('Recuse yourself and request reassignment.');
    expect(s3.getObjectStream).not.toHaveBeenCalled();
  });

  it('blocks an unpaid student from recording a paid-resource download', async () => {
    const paid = resource({ moderationStatus: ResourceModerationStatus.APPROVED, pricingMode: ResourcePricingMode.FIXED, uploaderId: 'lecturer-1' });
    resourceRepository.findOne.mockResolvedValue(paid);
    resourcePurchaseRepository.findOne.mockResolvedValue(null);
    const savedRepository: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const downloadService = new ResourcesService(resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup);

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'student-1', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('allows a student with a recorded purchase to download a paid resource', async () => {
    const paid = resource({ moderationStatus: ResourceModerationStatus.APPROVED, pricingMode: ResourcePricingMode.FIXED, uploaderId: 'lecturer-1' });
    resourceRepository.findOne.mockResolvedValue(paid);
    resourcePurchaseRepository.findOne.mockResolvedValue({ id: 'purchase-1', userId: 'student-1', resourceId: 'resource-1' });
    const savedRepository: any = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value), save: jest.fn(async value => value) };
    const downloadService = new ResourcesService(resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup);

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'student-1', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any)).resolves.toEqual({ downloaded: true, resourceId: 'resource-1' });
  });

  it('does not let an admin or moderator download their own uploaded resource', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ uploaderId: 'privileged-owner', moderationStatus: ResourceModerationStatus.APPROVED }));
    const savedRepository: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const downloadService = new ResourcesService(resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup);
    await expect(downloadService.downloadForUser('resource-1', {
      id: 'privileged-owner', role: UserRole.ADMIN,
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('does not allow admins or moderators to save pending review documents', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({ uploaderId: 'another-user' }));
    const savedRepository: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const saveService = new ResourcesService(resourceRepository, {} as any, {} as any, activityRepository, savedRepository, resourcePurchaseRepository, storageCleanup);
    await expect(saveService.saveForUser('resource-1', {
      id: 'admin-1', role: UserRole.ADMIN,
    } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('rejects unsupported roles', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({
      moderationStatus: ResourceModerationStatus.APPROVED,
    }));
    await expect(service.findOneForViewer('resource-1', {
      id: 'outsider', role: 'guest',
    } as any, false)).rejects.toBeInstanceOf(ForbiddenException);
  });
});


describe('ResourcesService.getReaderFile', () => {
  const pdf = {
    id: 'resource-reader-1',
    title: 'Protected lecture notes',
    uploaderId: 'lecturer-1',
    moderationStatus: ResourceModerationStatus.APPROVED,
    fileUrl: 'https://storage.example.test/private/resources/00000000-0000-0000-0000-000000000001/notes.pdf',
    pricingMode: ResourcePricingMode.FREE,
  };
  const body = { pipe: jest.fn(), on: jest.fn() } as any;
  const resourceRepository: any = {
    findOne: jest.fn().mockResolvedValue(pdf),
    save: jest.fn(async value => value),
    manager: { query: jest.fn().mockResolvedValue([{ declaration: 'no_conflict' }]) },
  };
  const savedResourceRepository: any = { findOne: jest.fn().mockResolvedValue({ downloadedAt: new Date() }) };
  const activityRepository: any = { create: jest.fn(value => value), save: jest.fn(async value => value) };
  const storage: any = {
    getKeyFromPublicUrl: jest.fn().mockReturnValue('resources/00000000-0000-0000-0000-000000000001/notes.pdf'),
    getObjectStream: jest.fn().mockResolvedValue({ body, contentType: 'application/pdf', contentLength: 2048 }),
  };
  const service = new ResourcesService(
    resourceRepository, {} as any, storage, activityRepository, savedResourceRepository,
    { findOne: jest.fn().mockResolvedValue(null) } as any, { enqueueWithManager: jest.fn() } as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('streams an authorized PDF without generating or returning a storage URL', async () => {
    const result = await service.getReaderFile('resource-reader-1', {
      id: 'student-1', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any);

    expect(result).toMatchObject({
      filename: 'Protected lecture notes.pdf',
      contentType: 'application/pdf',
      contentLength: 2048,
    });
    expect(result.body).toBe(body);
    expect(storage.getObjectStream).toHaveBeenCalledWith('resources/00000000-0000-0000-0000-000000000001/notes.pdf');
    expect(storage.createPresignedDownloadUrl).toBeUndefined();
    expect(activityRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'student-1', eventType: 'file_access', resourceId: 'resource-reader-1',
    }));
  });

  it('does not stream non-PDF files into the protected PDF reader', async () => {
    resourceRepository.findOne.mockResolvedValueOnce({ ...pdf, fileUrl: 'https://storage.example.test/private/resources/00000000-0000-0000-0000-000000000001/notes.docx' })
      .mockResolvedValueOnce({ ...pdf, fileUrl: 'https://storage.example.test/private/resources/00000000-0000-0000-0000-000000000001/notes.docx' });
    storage.getKeyFromPublicUrl.mockReturnValue('resources/00000000-0000-0000-0000-000000000001/notes.docx');

    await expect(service.getReaderFile('resource-reader-1', {
      id: 'student-1', role: UserRole.STUDENT, institutionId: 'institution-1',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });
});
