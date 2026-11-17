import { BadRequestException, ConflictException } from '@nestjs/common';
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
  let service: ReviewerApplicationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    applications.findOne.mockResolvedValue(null);
    service = new ReviewerApplicationsService(
      applications as unknown as Repository<ReviewerApplication>,
      decisions as unknown as Repository<ReviewerApplicationDecision>,
      dataSource as unknown as DataSource,
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

    const result = await service.submit(user, dto);

    expect(result).toMatchObject({
      userId: user.id,
      status: ReviewerApplicationStatus.SUBMITTED,
      institution: null,
      faculty: null,
      department: null,
      policyAccepted: true,
    });
    expect(user.reviewerStatus).toBe('submitted');
    expect(manager.save).toHaveBeenCalledWith(User, user);
  });

  it('requires an existing Student or Lecturer affiliation before application', async () => {
    const user = { id: 'student-1', role: UserRole.STUDENT, hasReviewerAccess: false } as User;
    await expect(service.submit(user, {
      qualifications: ['BSc'],
      expertiseAreas: ['Biology'],
      academicLevels: ['Undergraduate'],
      reviewExperience: 'I have relevant academic review experience across several research projects.',
      conflictDeclaration: 'I will disclose all relevant conflicts and recuse myself when necessary.',
      policyAccepted: true,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('prevents a second active application for the same account', async () => {
    applications.findOne.mockResolvedValue({ id: 'application-1', status: ReviewerApplicationStatus.UNDER_REVIEW });
    const user = { id: 'student-1', role: UserRole.STUDENT } as User;

    await expect(service.submit(user, {
      qualifications: ['BSc'],
      expertiseAreas: ['Biology'],
      academicLevels: ['Undergraduate'],
      reviewExperience: 'I have relevant academic review experience across several research projects.',
      conflictDeclaration: 'I will disclose all relevant conflicts and recuse myself when necessary.',
      policyAccepted: true,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce(user);

    await service.decide('application-1', { id: 'admin-1', role: UserRole.ADMIN } as User, {
      status: ReviewerApplicationStatus.APPROVED,
      approvedExpertiseAreas: ['Biology'],
      approvedAcademicLevels: ['Undergraduate'],
    });

    expect(user).toMatchObject({
      role: UserRole.STUDENT,
      hasReviewerAccess: true,
      reviewerStatus: ReviewerApplicationStatus.APPROVED,
      reviewerExpertise: ['Biology'],
      reviewerAcademicLevels: ['Undergraduate'],
    });
    expect(manager.save).toHaveBeenCalledWith(User, user);
  });
});
