import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommunityResourcesService } from './community-resources.service';
import { ResourceLicense, ResourceModerationStatus, ResourceType } from './entities/resource.entity';
import { UserRole } from '../users/entities/user.entity';

describe('CommunityResourcesService', () => {
  const resourceRepository: any = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };
  const userRepository: any = { findOne: jest.fn() };
  const transactionManager: any = {
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (_entity, value) => value),
  };
  resourceRepository.manager = { transaction: jest.fn(async (callback) => callback(transactionManager)) };
  const storage: any = {
    getKeyFromPublicUrl: jest.fn(),
    createPresignedDownloadUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
  };
  let service: CommunityResourcesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunityResourcesService(resourceRepository, userRepository, storage);
  });

  it('rejects a contribution without an affirmative rights declaration', async () => {
    await expect(service.create({
      title: 'Notes', type: ResourceType.LECTURE_NOTES,
      license: ResourceLicense.CC_BY_4_0, attribution: 'Student', rightsConfirmed: false,
    }, 'student-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.findOne).not.toHaveBeenCalled();
    expect(resourceRepository.save).not.toHaveBeenCalled();
  });

  it('creates student/lecturer contributions as pending and records the rights declaration', async () => {
    const uploader = { id: 'student-1', role: UserRole.STUDENT, institutionId: 'institution-1' };
    userRepository.findOne.mockResolvedValue(uploader);
    const dto = {
      title: 'Calculus notes', type: ResourceType.LECTURE_NOTES,
      license: ResourceLicense.CC_BY_4_0, attribution: 'A. Student',
      rightsConfirmed: true,
    };
    const saved = await service.create(dto as any, uploader.id);
    expect(resourceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      uploader, uploaderId: uploader.id, moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false, rightsConfirmed: true, rightsConfirmedAt: expect.any(Date),
    }));
    expect(saved.moderationStatus).toBe(ResourceModerationStatus.PENDING);
  });

  it('does not expose a non-approved resource through public detail', async () => {
    resourceRepository.findOne.mockResolvedValue(null);
    await expect(service.findPublicOne('private-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(resourceRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'private-id', moderationStatus: ResourceModerationStatus.APPROVED, rightsConfirmed: true },
      relations: ['uploader'],
    });
  });

  it('does not issue a public file URL for an unapproved resource', async () => {
    resourceRepository.findOne.mockResolvedValue(null);
    await expect(service.getPublicFileUrl('pending-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});
