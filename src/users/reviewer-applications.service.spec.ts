import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ReviewerApplicationsService } from './reviewer-applications.service';
import { ReviewerApplication, ReviewerApplicationStatus } from './entities/reviewer-application.entity';
import { ReviewerApplicationDecision } from './entities/reviewer-application-decision.entity';
import { User, UserRole } from './entities/user.entity';

describe('ReviewerApplicationsService', () => {
  const applications = {
    create: jest.fn((value) => value),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const decisions = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const manager = {
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (_entity, value) => value),
    findOne: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: any) => Promise<unknown>) => callback(manager)),
  };
  const notificationsService = { createNotification: jest.fn().mockResolvedValue(undefined) };
  let service: ReviewerApplicationsService;

  beforeEach(() => {
    process.env.REVIEWER_RECRUITMENT_OPEN = 'true';
    delete process.env.REVIEWER_TEST_ACCOUNT_EMAIL;
    jest.clearAllMocks();
    applications.findOne.mockResolvedValue(null);
    manager.findOne.mockReset().mockResolvedValue(null);
    service = new ReviewerApplicationsService(
      applications as unknown as Repository<ReviewerApplication>,
      decisions as unknown as Repository<ReviewerApplicationDecision>,
      dataSource as unknown as DataSource,
      notificationsService as never,
    );
  });

  it('accepts an independent External Reviewer application without university affiliation', async () => {
    const user = {
      id: 'external-reviewer-1',
      role: UserRole.REVIEWER,
      academicAccountType: 'external_reviewer',
      hasReviewerAccess: false,
    } as User;
    const dto = {
      qualifications: ['MSc Research Methods'],
      expertiseAreas: ['Research methods'],
      academicLevels: ['Postgraduate'],
      reviewExperience: 'I have several years of academic and professional peer-review experience.',
      supportingDocuments: [],
      conflictDeclaration: 'I will disclose relationships and recuse myself whenever a conflict exists.',
      policyAccepted: true,
    };

    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    const result = await service.submit(user, dto);

    expect(result).toMatchObject({
      userId: user.id,
      status: ReviewerApplicationStatus.SUBMITTED,
      institution: null,
      faculty: null,
      department: null,
      policyAccepted: true,
    });
    expect(manager.findOne).toHaveBeenNthCalledWith(1, User, expect.objectContaining({
      where: { id: user.id },
      lock: { mode: 'pessimistic_write' },
    }));
    expect(manager.findOne).toHaveBeenNthCalledWith(2, ReviewerApplication, expect.objectContaining({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    }));
    expect(user.reviewerStatus).toBe('submitted');
    expect(manager.save).toHaveBeenCalledWith(User, user);
  });

  it('blocks new applications while reviewer recruitment is closed for non-allowlisted accounts', async () => {
    process.env.REVIEWER_RECRUITMENT_OPEN = 'false';
    delete process.env.REVIEWER_TEST_ACCOUNT_EMAIL;
    const user = { id: 'student-closed-1', email: 'student@example.com', role: UserRole.STUDENT, hasReviewerAccess: false } as User;
    await expect(service.submit(user, {
      qualifications: ['BSc'],
      expertiseAreas: ['Biology'],
      academicLevels: ['Undergraduate'],
      reviewExperience: 'I have relevant academic review experience across several research projects.',
      conflictDeclaration: 'I will disclose all relevant conflicts and recuse myself when necessary.',
      policyAccepted: true,
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('requires an existing Student or Lecturer affiliation before application', async () => {
    const user = { id: 'student-1', role: UserRole.STUDENT, hasReviewerAccess: false } as User;
    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    await expect(service.submit(user, {
      qualifications: ['BSc'],
      expertiseAreas: ['Biology'],
      academicLevels: ['Undergraduate'],
      reviewExperience: 'I have relevant academic review experience across several research projects.',
      conflictDeclaration: 'I will disclose all relevant conflicts and recuse myself when necessary.',
      policyAccepted: true,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only qualifications, expertise and declarations after normalization', async () => {
    const user = { id: 'external-reviewer-1', role: UserRole.REVIEWER, hasReviewerAccess: false } as User;
    await expect(service.submit(user, {
      qualifications: ['   '],
      expertiseAreas: ['   '],
      academicLevels: ['   '],
      reviewExperience: ' '.repeat(45),
      conflictDeclaration: ' '.repeat(30),
      policyAccepted: true,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('prevents a second active application for the same account', async () => {
    const user = { id: 'student-1', role: UserRole.STUDENT } as User;
    manager.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce({ id: 'application-1', status: ReviewerApplicationStatus.UNDER_REVIEW });

    await expect(service.submit(user, {
      qualifications: ['BSc'],
      expertiseAreas: ['Biology'],
      academicLevels: ['Undergraduate'],
      reviewExperience: 'I have relevant academic review experience across several research projects.',
      conflictDeclaration: 'I will disclose all relevant conflicts and recuse myself when necessary.',
      policyAccepted: true,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('allows the Global Academic Reviewer to list applications and prevents self-approval', async () => {
    const globalReviewer = { id: 'global-reviewer-1', role: UserRole.REVIEWER, isGlobalReviewer: true, hasReviewerAccess: true, reviewerStatus: 'approved', isSuspended: false, accountStatus: 'active' } as User;
    applications.find.mockResolvedValue([]);
    await expect(service.listForAdmin(undefined, globalReviewer)).resolves.toEqual([]);
    expect(applications.find).toHaveBeenCalled();

    applications.findOne.mockResolvedValue({ id: 'own-app', userId: globalReviewer.id });
    await expect(service.decide('own-app', globalReviewer, { status: ReviewerApplicationStatus.APPROVED } as never))
      .rejects.toThrow('The Global Academic Reviewer cannot decide their own reviewer application.');
  });

  it('grants reviewer access without changing a Student primary identity', async () => {
    const application = {
      id: 'application-1',
      userId: 'student-1',
      status: ReviewerApplicationStatus.SUBMITTED,
      expertiseAreas: ['Biology'],
      academicLevels: ['Undergraduate'],
    } as ReviewerApplication;
    const user = {
      id: 'student-1',
      role: UserRole.STUDENT,
      hasReviewerAccess: false,
      reviewerStatus: 'submitted',
    } as User;
    manager.findOne
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce(application);

    await service.decide('application-1', { id: 'admin-1', role: UserRole.ADMIN } as User, {
      status: ReviewerApplicationStatus.APPROVED,
      approvedExpertiseAreas: ['Biology'],
      approvedAcademicLevels: ['Undergraduate'],
    });

    expect(manager.findOne).toHaveBeenNthCalledWith(2, User, expect.objectContaining({
      where: { id: user.id },
      lock: { mode: 'pessimistic_write' },
    }));
    expect(manager.findOne).toHaveBeenNthCalledWith(3, ReviewerApplication, expect.objectContaining({
      where: { id: application.id },
      lock: { mode: 'pessimistic_write' },
    }));
    expect(user).toMatchObject({
      role: UserRole.STUDENT,
      hasReviewerAccess: true,
      reviewerStatus: ReviewerApplicationStatus.APPROVED,
      reviewerExpertise: ['Biology'],
      reviewerAcademicLevels: ['Undergraduate'],
    });
    expect(manager.save).toHaveBeenCalledWith(User, user);
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      user.id,
      'reviewer_application_decision',
      'Academic Reviewer access approved',
      'Your Academic Reviewer access has been approved. Your reviewer workspace is now available.',
      '/moderation',
    );
  });
});
