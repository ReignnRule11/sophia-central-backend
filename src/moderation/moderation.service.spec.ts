import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User, UserRole } from '../users/entities/user.entity';

describe('ModerationService academic reviewer workflow', () => {
  const resourceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  };
  const reviewRepository = {
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ id: 'review-1', ...value })),
  };
  const userRepository = { findOne: jest.fn() };
  const notificationsService = { createNotification: jest.fn().mockResolvedValue(undefined) };
  let service: ModerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ModerationService(
      resourceRepository as any,
      reviewRepository as any,
      userRepository as any,
      notificationsService as any,
    );
  });

  it('limits a reviewer queue to resources explicitly assigned to that reviewer', async () => {
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    resourceRepository.find.mockResolvedValue([]);
    await service.getQueue(reviewer);
    expect(resourceRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: 'reviewer-1' },
    }));
  });


  it('does not return queue items to suspended reviewers', async () => {
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER, isSuspended: true } as User;
    await expect(service.getQueue(reviewer)).resolves.toEqual([]);
    expect(resourceRepository.find).not.toHaveBeenCalled();
  });

  it('rejects assignment to a non-reviewer account', async () => {
    resourceRepository.findOne.mockResolvedValue({
      id: 'resource-1',
      moderationStatus: ResourceModerationStatus.PENDING,
    });
    userRepository.findOne.mockResolvedValue({ id: 'user-1', role: UserRole.LECTURER, reviewerExpertise: ['Biology'] });
    await expect(service.assignReviewer('resource-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepository.save).not.toHaveBeenCalled();
  });

  it('prevents a reviewer from deciding on an unassigned resource', async () => {
    resourceRepository.findOne.mockResolvedValue({
      id: 'resource-1',
      moderationStatus: ResourceModerationStatus.PENDING,
      assignedReviewerId: 'reviewer-2',
      uploaderId: 'lecturer-1',
    });
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    await expect(service.reviewResource('resource-1', {
      status: ResourceModerationStatus.APPROVED,
    }, reviewer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records a revision request and requires reviewer feedback', async () => {
    const resource = {
      id: 'resource-1',
      title: 'Research methods',
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
      assignedReviewerId: 'reviewer-1',
      uploaderId: 'lecturer-1',
      uploader: { id: 'lecturer-1' },
    };
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    resourceRepository.findOne.mockResolvedValue(resource);
    userRepository.findOne.mockResolvedValue(reviewer);
    resourceRepository.save.mockImplementation(async (value) => value);

    const result = await service.reviewResource('resource-1', {
      status: ResourceModerationStatus.REVISION_REQUESTED,
      note: 'Please add source references.',
    }, reviewer);

    expect(resource.moderationStatus).toBe(ResourceModerationStatus.REVISION_REQUESTED);
    expect(resource.isVerified).toBe(false);
    expect(reviewRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: ResourceModerationStatus.REVISION_REQUESTED,
      note: 'Please add source references.',
    }));
    expect(result.status).toBe(ResourceModerationStatus.REVISION_REQUESTED);
  });
});
