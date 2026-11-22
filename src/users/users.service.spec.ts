import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';
import { Institution } from '../institutions/entities/institution.entity';

describe('UsersService institution identity updates', () => {
  let service: UsersService;
  let manager: any;
  let dataSource: any;
  let usersRepository: any;
  const existingUser = {
    id: 'student-1',
    role: 'student',
    isProfileComplete: true,
    institution: 'Old University',
    institutionId: null,
    faculty: 'Arts',
    department: 'History',
  };
  const catalogueInstitution = {
    id: 'institution-new',
    name: 'New University',
    institutionCode: 'NEWUNI',
    institutionType: 'university',
  };

  beforeEach(() => {
    manager = {
      findOne: jest.fn(async (entity) => entity === Institution ? { ...catalogueInstitution } : { ...existingUser }),
      query: jest.fn(),
      save: jest.fn(async (_entity, value) => value),
      createQueryBuilder: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async callback => callback(manager)),
    };
    usersRepository = { exist: jest.fn().mockResolvedValue(false) };
    service = new UsersService(usersRepository as Repository<User>, {} as Repository<Institution>, dataSource as DataSource, {} as any);
  });

  it('assigns a permanent ID when a legacy account selects a catalogue institution', async () => {
    const updated = await service.update('student-1', {
      institutionId: catalogueInstitution.id,
      institution: catalogueInstitution.name,
      faculty: 'Engineering',
      department: 'Mechanical Engineering',
    });

    expect(updated).toMatchObject({
      institutionId: catalogueInstitution.id,
      institution: catalogueInstitution.name,
      faculty: 'Engineering',
      department: 'Mechanical Engineering',
    });
    expect(updated.uniqueId).toMatch(/^SC-UNI-NEWUNI-STU-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('adds one academic identity to an approved External Reviewer without removing reviewer access', async () => {
    const externalReviewer = {
      id: 'reviewer-1',
      role: UserRole.REVIEWER,
      academicAccountType: 'external_reviewer',
      hasReviewerAccess: true,
      reviewerStatus: 'approved',
      reviewerExpertise: ['Biology'],
      reviewerAcademicLevels: ['Undergraduate'],
    };
    manager.findOne.mockImplementation(async (entity) => entity === Institution ? { ...catalogueInstitution } : { ...externalReviewer });

    const updated = await service.transitionExternalReviewer('reviewer-1', {
      targetRole: UserRole.STUDENT,
      institutionId: catalogueInstitution.id,
      faculty: 'Science',
      department: 'Biological Sciences',
      program: 'BSc Biology',
      studyLevel: '300',
    });

    expect(updated).toMatchObject({
      role: UserRole.STUDENT,
      academicAccountType: 'student',
      institutionId: catalogueInstitution.id,
      hasReviewerAccess: true,
      reviewerStatus: 'approved',
      isProfileComplete: true,
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO academic_account_transitions'),
      ['reviewer-1', 'external_reviewer', UserRole.STUDENT, 'reviewer-1'],
    );
  });

  it('suspends an approved platform account and records the reason', async () => {
    const moderator = {
      id: 'moderator-1',
      role: UserRole.MODERATOR,
      emailVerified: true,
      accountStatus: 'active',
      isSuspended: false,
      hasReviewerAccess: false,
      isGlobalReviewer: false,
      platformRoleStatus: 'approved',
      platformRoleVerifiedAt: new Date(),
    };
    const admin = { id: 'admin-1', role: UserRole.ADMIN, emailVerified: true, accountStatus: 'active', isSuspended: false };
    manager.findOne.mockImplementation(async (_entity, options) => options?.where?.id === 'admin-1' ? { ...admin } : { ...moderator });

    const updated = await service.updatePlatformRoleAccess('admin-1', 'moderator-1', 'suspend', 'Security review');

    expect(updated).toMatchObject({
      platformRoleStatus: 'suspended',
      isSuspended: true,
      suspensionReason: 'Security review',
    });
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO platform_role_audit_events'),
      ['admin-1', 'moderator-1', UserRole.MODERATOR, 'suspend', UserRole.MODERATOR, UserRole.MODERATOR, 'Security review'],
    );
  });

  it('revokes platform workspace access without deleting the account', async () => {
    const support = {
      id: 'support-1',
      role: UserRole.SUPPORT,
      emailVerified: true,
      accountStatus: 'active',
      isSuspended: false,
      hasReviewerAccess: false,
      isGlobalReviewer: false,
      platformRoleStatus: 'approved',
      platformRoleVerifiedAt: new Date(),
    };
    const admin = { id: 'admin-1', role: UserRole.ADMIN, emailVerified: true, accountStatus: 'active', isSuspended: false };
    manager.findOne.mockImplementation(async (_entity, options) => options?.where?.id === 'admin-1' ? { ...admin } : { ...support });

    const updated = await service.updatePlatformRoleAccess('admin-1', 'support-1', 'revoke', 'Role no longer required');

    expect(updated).toMatchObject({
      id: 'support-1',
      role: UserRole.SUPPORT,
      platformRoleStatus: 'revoked',
      platformRoleVerifiedAt: null,
      isSuspended: false,
    });
    expect(manager.save).toHaveBeenCalledWith(User, expect.objectContaining({ platformRoleStatus: 'revoked' }));
  });

  it('rejects platform lifecycle changes when the actor is not an active, verified Admin', async () => {
    manager.findOne.mockResolvedValue({
      id: 'admin-1', role: UserRole.MODERATOR, emailVerified: true,
      accountStatus: 'active', isSuspended: false,
    });
    await expect(service.updatePlatformRoleAccess('admin-1', 'moderator-1', 'revoke', 'Reason'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a manually typed institution without a catalogue reference', async () => {
    await expect(service.update('student-1', {
      institution: 'Unlisted University',
      faculty: 'School of Computing',
      department: 'Software Engineering',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('requires faculty and department when assigning a catalogue institution', async () => {
    await expect(service.update('student-1', {
      institutionId: catalogueInstitution.id,
      institution: catalogueInstitution.name,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
