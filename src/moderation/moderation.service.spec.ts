import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { Resource, ResourceModerationStatus } from '../resources/entities/resource.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ResourceRewardOutbox } from '../points/entities/resource-reward-outbox.entity';

describe('ModerationService academic reviewer workflow', () => {
  const transactionManager = {
    findOne: jest.fn(),
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (entity, value) => entity === Resource ? value : { id: 'review-1', ...value }),
    query: jest.fn().mockResolvedValue([]),
  };
  const resourceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
    manager: {
      transaction: jest.fn(async callback => callback(transactionManager)),
      query: jest.fn().mockResolvedValue([{ declaration: 'no_conflict' }]),
    },
  };
  const reviewRepository = {
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ id: 'review-1', ...value })),
  };
  const userRepository = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
  const notificationsService = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const pointsService = { processResourceApprovalReward: jest.fn().mockResolvedValue(true) };
  let service: ModerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    transactionManager.findOne.mockReset();
    transactionManager.query.mockReset().mockResolvedValue([{ declaration: 'no_conflict' }]);
    pointsService.processResourceApprovalReward.mockResolvedValue(true);
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


  it('gives the Global Academic Reviewer the platform-wide pending queue', async () => {
    const reviewer = { id: 'global-reviewer-1', role: UserRole.REVIEWER, hasReviewerAccess: true, isGlobalReviewer: true, reviewerStatus: 'approved', isSuspended: false, accountStatus: 'active' } as User;
    resourceRepository.find.mockResolvedValue([]);
    await expect(service.getQueue(reviewer)).resolves.toEqual([]);
    expect(resourceRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { moderationStatus: ResourceModerationStatus.PENDING },
    }));
  });

  it('allows the Global Academic Reviewer to inspect the full reviewer roster', async () => {
    const reviewer = { id: 'global-reviewer-1', role: UserRole.REVIEWER, hasReviewerAccess: true, reviewerStatus: 'approved', isGlobalReviewer: true, accountStatus: 'active' } as User;
    userRepository.find.mockResolvedValue([]);
    await expect(service.getReviewerRoster(reviewer)).resolves.toEqual([]);
    expect(userRepository.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.arrayContaining([{ hasReviewerAccess: true }, { reviewerStatus: 'suspended' }, { reviewerStatus: 'revoked' }]) }));
  });

  it('allows an approved Student account to use its additional reviewer capability', async () => {
    const reviewer = {
      id: 'student-reviewer-1',
      role: UserRole.STUDENT,
      hasReviewerAccess: true,
      reviewerStatus: 'approved',
      isSuspended: false,
    } as User;
    resourceRepository.find.mockResolvedValue([]);
    await expect(service.getQueue(reviewer)).resolves.toEqual([]);
    expect(resourceRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: 'student-reviewer-1' },
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
    transactionManager.findOne.mockResolvedValueOnce({ id: 'user-1', role: UserRole.LECTURER, reviewerExpertise: ['Biology'] }).mockResolvedValueOnce({ id: 'resource-1', moderationStatus: ResourceModerationStatus.PENDING });
    await expect(service.assignReviewer('resource-1', 'user-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(resourceRepository.save).not.toHaveBeenCalled();
  });

  it('notifies the assigned reviewer when a resource is assigned', async () => {
    transactionManager.findOne.mockResolvedValueOnce({ id: 'reviewer-1', role: UserRole.REVIEWER, isSuspended: false, reviewerExpertise: ['Biology'], reviewerAcademicLevels: ['300 level'] });
    transactionManager.findOne.mockResolvedValueOnce({
      id: 'resource-1',
      title: 'Cell Biology',
      course: 'Biology',
      level: '300 level',
      moderationStatus: ResourceModerationStatus.PENDING,
    });
    resourceRepository.save.mockImplementation(async value => value);

    await service.assignReviewer('resource-1', 'reviewer-1', 'admin-1');

    expect(transactionManager.query).toHaveBeenCalledWith(
      'INSERT INTO reviewer_assignment_events (\"assignmentId\", \"resourceId\", \"reviewerId\", \"actorId\", \"eventType\") VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)',
      expect.arrayContaining(['resource-1', 'reviewer-1', 'admin-1', 'assigned']),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'reviewer-1',
      'resource_review_assigned',
      'A new academic resource was assigned to you',
      '“Cell Biology” is ready for your academic review.',
      '/moderation',
    );
  });

  it('lets the Global Academic Reviewer self-assign an unassigned resource before declaring no conflict', async () => {
    const reviewer = { id: 'global-reviewer-1', role: UserRole.REVIEWER, hasReviewerAccess: true, isGlobalReviewer: true, reviewerStatus: 'approved', accountStatus: 'active', isSuspended: false } as User;
    const resource = { id: 'resource-global-1', title: 'Cross-disciplinary research', moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: null, reviewAssignmentId: null };
    transactionManager.findOne.mockResolvedValueOnce(reviewer).mockResolvedValueOnce(resource);
    transactionManager.query.mockReset().mockResolvedValueOnce([]).mockResolvedValue([]);

    await expect(service.declareConflict('resource-global-1', { declaration: 'no_conflict' }, reviewer))
      .resolves.toEqual({ declaration: 'no_conflict', reassignmentRequired: false });

    expect(resource.assignedReviewerId).toBe(reviewer.id);
    expect(resource.reviewAssignmentId).toBeTruthy();
    expect(transactionManager.save).toHaveBeenCalledWith(Resource, resource);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reviewer_conflict_declarations'),
      expect.arrayContaining([resource.id, reviewer.id, 'no_conflict']),
    );
  });

  it('records recusal and releases the assignment atomically', async () => {
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    const resource = {
      id: 'resource-1',
      title: 'Cell Biology',
      moderationStatus: ResourceModerationStatus.PENDING,
      assignedReviewerId: reviewer.id,
      reviewAssignmentId: 'assignment-1',
    };
    transactionManager.findOne.mockResolvedValueOnce(reviewer).mockResolvedValueOnce(resource);
    userRepository.find.mockResolvedValue([]);

    await expect(service.declareConflict('resource-1', {
      declaration: 'recuse',
      reason: 'I have a direct professional relationship with one of the contributors.',
    }, reviewer)).resolves.toEqual({ declaration: 'recuse', reassignmentRequired: true });

    expect(resource.assignedReviewerId).toBeNull();
    expect(resource.reviewAssignmentId).toBeNull();
    expect(transactionManager.save).toHaveBeenCalledWith(Resource, resource);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)"),
      ['assignment-1', 'resource-1', 'reviewer-1', 'reviewer-1', 'recused'],
    );
    expect(resourceRepository.manager.transaction).toHaveBeenCalled();
  });

  it('prevents a reviewer from deciding on an unassigned resource', async () => {
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    transactionManager.findOne.mockResolvedValueOnce(reviewer).mockResolvedValueOnce({
      id: 'resource-1',
      moderationStatus: ResourceModerationStatus.PENDING,
      assignedReviewerId: 'reviewer-2',
      uploaderId: 'lecturer-1',
    });
    await expect(service.reviewResource('resource-1', {
      status: ResourceModerationStatus.APPROVED,
    }, reviewer)).rejects.toBeInstanceOf(ForbiddenException);
  });


  it('does not allow a moderator to approve academic resources', async () => {
    resourceRepository.findOne.mockResolvedValue({ id: 'resource-1', moderationStatus: ResourceModerationStatus.PENDING, assignedReviewerId: 'reviewer-1', uploaderId: 'student-1' });
    await expect(service.reviewResource('resource-1', { status: ResourceModerationStatus.APPROVED }, { id: 'moderator-1', role: UserRole.MODERATOR } as User))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('awards 10 Wisdom Points when a student contribution is approved', async () => {
    const resource = {
      id: 'resource-student-1',
      title: 'Cell Biology Notes',
      moderationStatus: ResourceModerationStatus.PENDING,
      isVerified: false,
      assignedReviewerId: 'reviewer-1',
      reviewAssignmentId: 'assignment-1',
      uploaderId: 'student-1',
      uploader: { id: 'student-1', role: UserRole.STUDENT },
    };
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    transactionManager.findOne.mockResolvedValueOnce(reviewer).mockResolvedValueOnce(resource).mockResolvedValueOnce(resource.uploader);
    resourceRepository.save.mockImplementation(async value => value);

    await service.reviewResource('resource-student-1', {
      status: ResourceModerationStatus.APPROVED,
    }, reviewer);

    expect(pointsService.processResourceApprovalReward).toHaveBeenCalledWith('resource-student-1');
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT declaration FROM reviewer_conflict_declarations'),
      ['assignment-1', 'reviewer-1'],
    );
    expect(transactionManager.findOne).toHaveBeenNthCalledWith(1, User, expect.objectContaining({
      where: { id: reviewer.id },
      lock: { mode: 'pessimistic_read' },
    }));
    expect(transactionManager.findOne).toHaveBeenNthCalledWith(2, Resource, expect.objectContaining({
      where: { id: 'resource-student-1' },
      lock: { mode: 'pessimistic_write' },
    }));
    expect(resourceRepository.manager.transaction).toHaveBeenCalled();
    expect(transactionManager.save).toHaveBeenCalledWith(
      ResourceRewardOutbox,
      expect.objectContaining({ resourceId: 'resource-student-1', userId: 'student-1' }),
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
      assignedReviewerId: 'reviewer-1',
      reviewAssignmentId: 'assignment-1',
      uploaderId: 'lecturer-1',
      uploader: { id: 'lecturer-1', role: UserRole.LECTURER },
    };
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    resource.assignedReviewerId = reviewer.id;
    transactionManager.findOne.mockResolvedValueOnce(reviewer).mockResolvedValueOnce(resource).mockResolvedValueOnce(resource.uploader);
    resourceRepository.save.mockImplementation(async value => value);
    pointsService.processResourceApprovalReward.mockResolvedValue(false);

    await service.reviewResource('resource-lecturer-1', {
      status: ResourceModerationStatus.APPROVED,
    }, reviewer);

    expect(pointsService.processResourceApprovalReward).not.toHaveBeenCalled();
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
      reviewAssignmentId: 'assignment-1',
      uploaderId: 'lecturer-1',
      uploader: { id: 'lecturer-1' },
    };
    const reviewer = { id: 'reviewer-1', role: UserRole.REVIEWER } as User;
    transactionManager.findOne.mockResolvedValueOnce(reviewer).mockResolvedValueOnce(resource).mockResolvedValueOnce(resource.uploader);
    userRepository.find.mockResolvedValue([{ id: 'moderator-1' }]);
    resourceRepository.save.mockImplementation(async (value) => value);

    const result = await service.reviewResource('resource-1', {
      status: ResourceModerationStatus.REVISION_REQUESTED,
      note: 'Please add source references.',
    }, reviewer);

    expect(resource.moderationStatus).toBe(ResourceModerationStatus.REVISION_REQUESTED);
    expect(resource.isVerified).toBe(false);
    expect(resourceRepository.manager.transaction).toHaveBeenCalled();
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
