import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { ResourceModerationStatus } from './entities/resource.entity';
import { UserRole } from '../users/entities/user.entity';

describe('ResourcesService.findOneForViewer authorization', () => {
  const resourceRepository: any = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const activityRepository: any = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const storageCleanup: any = { enqueueWithManager: jest.fn() };
  const service = new ResourcesService(
    resourceRepository,
    {} as any,
    {} as any,
    activityRepository,
    {} as any,
    storageCleanup,
  );

  const resource = (overrides: Record<string, unknown> = {}) => ({
    id: 'resource-1',
    title: 'Test contribution',
    uploaderId: 'student-owner',
    moderationStatus: ResourceModerationStatus.PENDING,
    fileUrl: 'https://storage.example.test/private/test.pdf',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a student to inspect their own pending submission', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    const result = await service.findOneForViewer('resource-1', {
      id: 'student-owner', role: UserRole.STUDENT,
    } as any, false);

    expect(result).toMatchObject({ id: 'resource-1', hasFile: true });
    expect(result.fileUrl).toBeUndefined();
  });

  it('allows a student to inspect their own rejected submission and its file metadata', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({
      moderationStatus: ResourceModerationStatus.REJECTED,
    }));
    const result = await service.findOneForViewer('resource-1', {
      id: 'student-owner', role: UserRole.STUDENT,
    } as any, false);

    expect(result.moderationStatus).toBe(ResourceModerationStatus.REJECTED);
    expect((result as typeof result & { hasFile?: boolean }).hasFile).toBe(true);
  });

  it('does not expose another contributor\'s pending resource to a student', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'other-student', role: UserRole.STUDENT,
    } as any, false)).rejects.toBeInstanceOf(NotFoundException);
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
      storageCleanup,
    );

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'student-owner', role: UserRole.STUDENT,
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
      storageCleanup,
    );

    await expect(downloadService.downloadForUser('resource-1', {
      id: 'other-student', role: UserRole.STUDENT,
    } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(savedRepository.save).not.toHaveBeenCalled();
  });

  it('allows a student to view another contributor\'s approved resource', async () => {
    resourceRepository.findOne.mockResolvedValue(resource({
      moderationStatus: ResourceModerationStatus.APPROVED,
    }));
    await expect(service.findOneForViewer('resource-1', {
      id: 'other-student', role: UserRole.STUDENT,
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('allows a lecturer to inspect their own pending submission', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'student-owner', role: UserRole.LECTURER,
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
  });

  it('does not expose another lecturer\'s pending resource to a lecturer', async () => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'other-lecturer', role: UserRole.LECTURER,
    } as any, false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([UserRole.MODERATOR, UserRole.ADMIN])('allows %s to inspect pending submissions', async (role) => {
    resourceRepository.findOne.mockResolvedValue(resource());
    await expect(service.findOneForViewer('resource-1', {
      id: 'reviewer-1', role,
    } as any, false)).resolves.toMatchObject({ id: 'resource-1' });
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
