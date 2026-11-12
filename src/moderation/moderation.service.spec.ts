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
  const userRepository = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
  const notificationsService = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const pointsService = { awardResourceApprovalReward: jest.fn().mockResolvedValue(true) };
  let service: ModerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    pointsService.awardResourceApprovalReward.mockResolvedValue(true);
    service = new ModerationService(
      resourceRepository as any,
      reviewRepository as any,
      userRepository as any,
      notificationsService as any,
      pointsService as any,
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

  it('notifies the assigned reviewer when a resource is assigned', async () => {
    resourceRepository.findOne.mockResolvedValue({
      id: 'resource-1',
      title: 'Cell Biology',
      moderationStatus: ResourceModerationStatus.PENDING,
    });
    userRepository.findOne.mockResolvedValue({
      id: 'reviewer-1',
      role: UserRole.REVIEWER,
      isSuspended: false,
      reviewerExpertise: ['Biology'],
    });
    resourceRepository.save.mockImplementation(async value => value);

    await service.assignReviewer('resource-1', 'reviewer-1');

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'reviewer-1',
      'resource_review_assigned',
      'A new academic resource was assigned to you',
      '“Cell Biology” is ready for your academic review.',
      '/moderation',
    );
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


  it('awards 10 Wisdom Points when a student contribution is approved', async () => {
    const resource = {
      id: 'resource-student-1',
      title: 'Cell Biology Notes',
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
      assignedReviewerId: null,
      uploaderId: 'student-1',
      uploader: { id: 'student-1', role: UserRole.STUDENT },
    };
    const reviewer = { id: 'moderator-1', role: UserRole.MODERATOR } as User;
    resourceRepository.findOne.mockResolvedValue(resource);
    userRepository.findOne.mockResolvedValue(reviewer);
    resourceRepository.save.mockImplementation(async value => value);

    await service.reviewResource('resource-student-1', {
      status: ResourceModerationStatus.APPROVED,
    }, reviewer);

    expect(pointsService.awardResourceApprovalReward).toHaveBeenCalledWith(
      'student-1',
      'resource-student-1',
      'Cell Biology Notes',
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'student-1',
      'resource_approved',
      'Your resource was approved',
      '“Cell Biology Notes” has been approved and is now available in the shared library. You have also earned 10 Wisdom Points.',
      '/library',
    );
  });

  it('does not award student-contribution points for lecturer uploads', async () => {
    const resource = {
      id: 'resource-lecturer-1',
      title: 'Lecture Slides',
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
      assignedReviewerId: null,
      uploaderId: 'lecturer-1',
      uploader: { id: 'lecturer-1', role: UserRole.LECTURER },
    };
    const reviewer = { id: 'moderator-1', role: UserRole.MODERATOR } as User;
    resourceRepository.findOne.mockResolvedValue(resource);
    userRepository.findOne.mockResolvedValue(reviewer);
    resourceRepository.save.mockImplementation(async value => value);
    pointsService.awardResourceApprovalReward.mockResolvedValue(false);

    await service.reviewResource('resource-lecturer-1', {
      status: ResourceModerationStatus.APPROVED,
    }, reviewer);

    expect(pointsService.awardResourceApprovalReward).toHaveBeenCalledWith(
      'lecturer-1',
      'resource-lecturer-1',
      'Lecture Slides',
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'lecturer-1',
      'resource_approved',
      'Your resource was approved',
      '“Lecture Slides” has been approved and is now available in the shared library.',
      '/library',
    );
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
    userRepository.find.mockResolvedValue([{ id: 'moderator-1' }]);
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
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'moderator-1',
      'resource_review_completed',
      'An academic resource review was completed',
      'A reviewer completed the review of “Research methods” with status: revision requested.',
      '/moderation',
    );
  });
});
