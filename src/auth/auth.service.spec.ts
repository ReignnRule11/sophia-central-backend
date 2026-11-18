import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';
import { ReviewerApplication, ReviewerApplicationStatus } from '../users/entities/reviewer-application.entity';
import { PreAccount } from './entities/pre-account.entity';
import { RegistrationDraft } from './entities/registration-draft.entity';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordResetEmailService } from './password-reset-email.service';
import { EmailVerificationEmailService } from './email-verification-email.service';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<UsersService, 'findByEmail' | 'findByAcademicHandle' | 'findByUniqueId' | 'create' | 'createWithManager' | 'update' | 'findOne'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let resetTokens: { delete: jest.Mock; save: jest.Mock; create: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let verificationTokens: { delete: jest.Mock; save: jest.Mock; create: jest.Mock; findOne: jest.Mock };
  let preAccounts: { findOne: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let registrationDrafts: { findOne: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let reviewerApplications: { create: jest.Mock; save: jest.Mock };
  let reviewerDecisions: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let registrationTokens: { seal: jest.Mock; open: jest.Mock; claimOnce: jest.Mock; releaseClaim: jest.Mock };
  let resetEmail: jest.Mocked<Pick<PasswordResetEmailService, 'sendResetLink'>>;
  let verificationEmail: jest.Mocked<Pick<EmailVerificationEmailService, 'sendVerificationLink'>>;
  let referrals: { validateReferralCode: jest.Mock; redeemReferral: jest.Mock; processPendingReferralForUser: jest.Mock };
  const user = {
    id: 'user-123', email: 'learner@example.com', firstName: 'Learner', lastName: 'One',
    password: '', role: 'student' as const, authProvider: 'email' as const,
    isVerified: false, emailVerified: false, isProfileComplete: false,
  };

  beforeEach(() => {
    process.env.REVIEWER_RECRUITMENT_OPEN = 'true';
    delete process.env.REVIEWER_TEST_ACCOUNT_EMAIL;
    delete process.env.GLOBAL_ACADEMIC_REVIEWER_EMAIL;
    users = { findByEmail: jest.fn(), findByAcademicHandle: jest.fn(), findByUniqueId: jest.fn(), create: jest.fn(), createWithManager: jest.fn().mockResolvedValue({ ...user, id: 'new-account-id' }), update: jest.fn().mockImplementation(async (_id, data) => ({ ...user, ...data })), findOne: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-access-token') };
    resetTokens = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn().mockResolvedValue({}),
      create: jest.fn((data) => data), findOne: jest.fn(), createQueryBuilder: jest.fn(),
    };
    verificationTokens = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn().mockResolvedValue({}),
      create: jest.fn((data) => data), findOne: jest.fn(),
    };
    preAccounts = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    registrationDrafts = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    reviewerApplications = { create: jest.fn((data) => data), save: jest.fn(async (data) => ({ id: 'global-reviewer-application', ...data })) };
    reviewerDecisions = { create: jest.fn((data) => data), save: jest.fn(async (data) => ({ id: 'global-reviewer-decision', ...data })) };
    dataSource = { transaction: jest.fn(async (callback: (manager: any) => Promise<any>) => callback({ getRepository: (entity: unknown) => entity === PreAccount ? preAccounts : entity === RegistrationDraft ? registrationDrafts : entity === ReviewerApplication ? reviewerApplications : reviewerDecisions })) };
    registrationTokens = {
      seal: jest.fn().mockReturnValue('encrypted-registration-token'),
      open: jest.fn(),
      claimOnce: jest.fn().mockResolvedValue(true),
      releaseClaim: jest.fn().mockResolvedValue(undefined),
    };
    resetEmail = { sendResetLink: jest.fn().mockResolvedValue(undefined) };
    verificationEmail = { sendVerificationLink: jest.fn().mockResolvedValue(undefined) };
    referrals = {
      validateReferralCode: jest.fn().mockResolvedValue(undefined),
      redeemReferral: jest.fn().mockResolvedValue({ success: true, message: 'Referral recorded.' }),
      processPendingReferralForUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      resetTokens as never,
      verificationTokens as never,
      preAccounts as never,
      registrationDrafts as never,
      dataSource as never,
      registrationTokens as never,
      resetEmail as unknown as PasswordResetEmailService,
      verificationEmail as unknown as EmailVerificationEmailService,
      referrals as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('limits closed recruitment to the exact configured reviewer test email', async () => {
    process.env.REVIEWER_RECRUITMENT_OPEN = 'false';
    process.env.REVIEWER_TEST_ACCOUNT_EMAIL = 'sophiscentral@gmail.com';
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);

    await expect(service.register({
      firstName: 'Other',
      lastName: 'Applicant',
      email: 'other@example.com',
      academicHandle: 'other.applicant',
      role: UserRole.REVIEWER,
    })).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.register({
      firstName: 'Sophis',
      lastName: 'Reviewer',
      email: 'SOPHISCENTRAL@gmail.com',
      academicHandle: 'sophis',
      role: UserRole.REVIEWER,
    })).resolves.toEqual(expect.objectContaining({ emailSent: true }));
  });

  it('bootstraps the exact configured Global Academic Reviewer after verified registration', async () => {
    process.env.REVIEWER_RECRUITMENT_OPEN = 'false';
    process.env.REVIEWER_TEST_ACCOUNT_EMAIL = 'sophiscentral@gmail.com';
    process.env.GLOBAL_ACADEMIC_REVIEWER_EMAIL = 'sophiscentral@gmail.com';
    const expiresAt = new Date(Date.now() + 60_000);
    preAccounts.findOne.mockResolvedValue({ email: 'sophiscentral@gmail.com', password: 'password-hash' });
    registrationDrafts.findOne.mockResolvedValue({ email: 'sophiscentral@gmail.com', expiresAt, encryptedPayload: 'encrypted-draft' });
    registrationTokens.open
      .mockReturnValueOnce({ stage: 'pre-account', email: 'sophiscentral@gmail.com', jti: 'resume-jti', expiresAt: expiresAt.getTime() })
      .mockReturnValueOnce({
        stage: 'pre-account-draft',
        email: 'sophiscentral@gmail.com',
        firstName: 'Sophis',
        lastName: 'Reviewer',
        academicHandle: 'sophis',
        role: UserRole.REVIEWER,
      });
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    users.createWithManager.mockResolvedValue({
      id: 'global-reviewer-id',
      email: 'sophiscentral@gmail.com',
      role: UserRole.REVIEWER,
      hasReviewerAccess: true,
      isGlobalReviewer: true,
      reviewerStatus: ReviewerApplicationStatus.APPROVED,
      reviewerExpertise: ['*'],
      reviewerAcademicLevels: ['*'],
      isProfileComplete: true,
    } as never);

    await service.completePreAccountOnboarding('onboarding-token', { bio: 'Platform-wide academic review test account' } as never);

    expect(users.createWithManager).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      email: 'sophiscentral@gmail.com',
      firstName: 'Sophis',
      lastName: 'Reviewer',
      academicHandle: 'sophis',
      role: UserRole.REVIEWER,
      hasReviewerAccess: true,
      isGlobalReviewer: true,
      reviewerStatus: ReviewerApplicationStatus.APPROVED,
      reviewerExpertise: ['*'],
      reviewerAcademicLevels: ['*'],
    }));
    expect(reviewerApplications.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'global-reviewer-id',
      status: ReviewerApplicationStatus.APPROVED,
      qualifications: ['Platform-wide test authorization; no professional qualification or licence is being represented.'],
      expertiseAreas: ['*'],
      academicLevels: ['*'],
      approvedExpertiseAreas: ['*'],
      approvedAcademicLevels: ['*'],
      supportingDocuments: ['https://example.com/qualification-evidence-placeholder'],
      policyAccepted: true,
    }));
    expect(reviewerDecisions.save).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: 'global-reviewer-application',
      actorId: null,
      fromStatus: ReviewerApplicationStatus.SUBMITTED,
      toStatus: ReviewerApplicationStatus.APPROVED,
    }));
  });

  it('routes an existing account to sign-in without disclosing its role', async () => {
    users.findByEmail.mockResolvedValue(user as never);
    users.findByAcademicHandle.mockResolvedValue(null);

    await expect(service.checkReviewerRegistrationIntent('LEARNER@example.com', 'learner_handle'))
      .resolves.toEqual({ requiresSignIn: true, signInIdentifier: 'learner@example.com' });
  });

  it('allows an unregistered identity to continue to External Reviewer registration', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);

    await expect(service.checkReviewerRegistrationIntent('new@example.com', 'new_handle'))
      .resolves.toEqual({ requiresSignIn: false });
  });

  it('registers an External Reviewer without requiring an institution or referral code', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);

    await service.register({
      firstName: 'External',
      lastName: 'Reviewer',
      email: 'reviewer@example.com',
      academicHandle: 'external.reviewer',
      role: UserRole.REVIEWER,
      referralCode: 'SHOULD_NOT_BE_USED',
    });

    expect(registrationTokens.seal).toHaveBeenCalledWith(expect.objectContaining({
      email: 'reviewer@example.com',
      academicHandle: 'external.reviewer',
      role: UserRole.REVIEWER,
      referralCode: undefined,
    }));
    expect(referrals.validateReferralCode).not.toHaveBeenCalled();
    expect(verificationEmail.sendVerificationLink).toHaveBeenCalled();
  });

  it('completes External Reviewer onboarding without a university affiliation', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    preAccounts.findOne.mockResolvedValue({ email: 'reviewer@example.com', password: 'password-hash' });
    registrationDrafts.findOne.mockResolvedValue({ email: 'reviewer@example.com', expiresAt, encryptedPayload: 'encrypted-draft' });
    registrationTokens.open
      .mockReturnValueOnce({ stage: 'pre-account', email: 'reviewer@example.com', jti: 'resume-jti', expiresAt: expiresAt.getTime() })
      .mockReturnValueOnce({
        stage: 'pre-account-draft',
        email: 'reviewer@example.com',
        firstName: 'External',
        lastName: 'Reviewer',
        academicHandle: 'external.reviewer',
        role: UserRole.REVIEWER,
      });
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    users.createWithManager.mockResolvedValue({
      id: 'external-reviewer-id',
      email: 'reviewer@example.com',
      role: UserRole.REVIEWER,
      academicAccountType: 'external_reviewer',
      isProfileComplete: true,
    } as never);

    await expect(service.completePreAccountOnboarding('onboarding-token', { bio: 'Independent research professional' } as never))
      .resolves.toEqual(expect.objectContaining({
        accessToken: 'signed-access-token',
        user: expect.objectContaining({ role: UserRole.REVIEWER, academicAccountType: 'external_reviewer' }),
      }));

    expect(users.createWithManager).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      email: 'reviewer@example.com',
      role: UserRole.REVIEWER,
    }));
    expect(referrals.redeemReferral).not.toHaveBeenCalled();
  });

  it('completes onboarding even if referral reward processing fails', async () => {
    users.findOne.mockResolvedValue({ ...user, isProfileComplete: false } as never);
    users.update.mockResolvedValue({ ...user, isProfileComplete: true } as never);
    referrals.processPendingReferralForUser.mockRejectedValue(new Error('temporary referral database failure'));

    await expect(service.completeOnboarding(user.id, {
      institutionId: '00000000-0000-4000-8000-000000000001',
      institution: 'New University',
      faculty: 'School of Computing',
      department: 'Software Engineering',
      program: 'B.Sc. Software Engineering',
      studyLevel: '300',
    } as never)).resolves.toEqual({
      accessToken: 'signed-access-token',
      user: expect.objectContaining({ isProfileComplete: true }),
    });

    expect(users.update).toHaveBeenCalledWith(user.id, expect.objectContaining({
      institution: 'New University',
      faculty: 'School of Computing',
      department: 'Software Engineering',
      isProfileComplete: true,
    }));
  });

  it('returns a generic response for unknown reset-request emails', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.requestPasswordReset({ email: 'missing@example.com' })).resolves.toEqual({
      message: 'If an account exists for that email, password reset instructions will be sent.',
    });
    expect(resetEmail.sendResetLink).not.toHaveBeenCalled();
  });

  it('stores only a token hash and emails a reset link for an eligible account', async () => {
    users.findByEmail.mockResolvedValue({ ...user, password: 'bcrypt-hash' } as never);
    await service.requestPasswordReset({ email: ' LEARNER@example.com ' });
    expect(resetTokens.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: user.id, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: expect.any(Date),
    }));
    expect(resetEmail.sendResetLink).toHaveBeenCalledWith(user.email, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), user.firstName);
  });

  it('sends an encrypted verification ticket without persisting registration details or creating a user', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    const response = await service.register({
      firstName: ' Learner ', lastName: ' One ', email: 'LEARNER@example.com',
      academicHandle: 'learner.one', role: UserRole.STUDENT,
    });
    expect(registrationTokens.seal).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'verify', email: 'learner@example.com', firstName: 'Learner',
      lastName: 'One', academicHandle: 'learner.one', role: 'student',
    }));
    expect(response.emailSent).toBe(true);
    expect(response).not.toHaveProperty('user');
    expect(users.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(verificationEmail.sendVerificationLink).toHaveBeenCalledWith(
      'learner@example.com', 'encrypted-registration-token', 'Learner',
    );
  });

  it('rejects duplicate academic handle registration', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(user as never);
    await expect(service.register({
      firstName: 'Another', lastName: 'Learner', email: 'another@example.com',
      academicHandle: '@learner.one',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('does not disclose whether an email already belongs to an account', async () => {
    users.findByEmail.mockResolvedValue(user as never);
    await expect(service.register({
      firstName: 'Learner', lastName: 'One', email: 'learner@example.com',
      academicHandle: 'learner.one',
    })).resolves.toEqual(expect.objectContaining({ emailSent: false }));
    expect(users.create).not.toHaveBeenCalled();
    expect(registrationTokens.seal).not.toHaveBeenCalled();
  });

  it('allows sign-in with a permanent Institution ID and password', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    const institutionId = 'SC-UNI-UNILAG-STU-7K4M9Q2D8X';
    users.findByUniqueId.mockResolvedValue({ ...user, uniqueId: institutionId, password, emailVerified: true } as never);
    await expect(service.login({ identifier: institutionId.toLowerCase(), password: 'correct-horse-battery' }))
      .resolves.toEqual(expect.objectContaining({ accessToken: 'signed-access-token' }));
    expect(users.findByUniqueId).toHaveBeenCalledWith(institutionId.toLowerCase());
    expect(jwt.signAsync).toHaveBeenCalled();
  });

  it('blocks password login until the email has been verified', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    users.findByEmail.mockResolvedValue({ ...user, password, emailVerified: false } as never);
    await expect(service.login({ identifier: user.email, password: 'correct-horse-battery' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('fails closed when an email account has no explicit verified flag', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    const legacyOrMalformedUser = { ...user, password, emailVerified: undefined };
    users.findByEmail.mockResolvedValue(legacyOrMalformedUser as never);
    await expect(service.login({ identifier: user.email, password: 'correct-horse-battery' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('records the successful login timestamp before issuing a session', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    users.findByEmail.mockResolvedValue({ ...user, password, emailVerified: true } as never);
    await service.login({ identifier: user.email, password: 'correct-horse-battery' });
    expect(users.update).toHaveBeenCalledWith(user.id, expect.objectContaining({ lastLoginAt: expect.any(Date) }));
    expect(jwt.signAsync).toHaveBeenCalled();
  });

  it('allows sign-in with an academic handle for an email-verified account', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    users.findByAcademicHandle.mockResolvedValue({ ...user, emailVerified: true, academicHandle: 'learner.one', password } as never);
    users.update.mockResolvedValue({ ...user, emailVerified: true, academicHandle: 'learner.one', lastLoginAt: new Date() } as never);
    const response = await service.login({ identifier: '@Learner.One', password: 'correct-horse-battery' });
    expect(users.findByAcademicHandle).toHaveBeenCalledWith('@Learner.One');
    expect('user' in response && response.user).toHaveProperty('academicHandle', 'learner.one');
    expect('user' in response && response.user).not.toHaveProperty('password');
  });

  it('returns the same authentication error for unknown email or wrong password', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({ identifier: 'missing@example.com', password: 'not-the-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies email and issues a pre-account token without creating a user', async () => {
    registrationTokens.open.mockReturnValue({
      stage: 'verify', jti: 'verify-jti', expiresAt: Date.now() + 60_000, email: 'learner@example.com',
      firstName: 'Learner', lastName: 'One', academicHandle: 'learner.one', role: 'student',
    });
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    registrationTokens.seal.mockReturnValue('pre-account-token');
    await expect(service.confirmEmailVerification('encrypted-verification-token', 'owner-chosen-password')).resolves.toEqual({
      message: 'Your email has been verified. Your pre-account is saved. Complete your academic profile now or sign in later to resume.',
      onboardingToken: 'pre-account-token',
      preAccount: { email: 'learner@example.com', firstName: 'Learner', lastName: 'One', academicHandle: 'learner.one', role: 'student' },
    });
    expect(preAccounts.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'learner@example.com', password: expect.any(String) }));
    expect(registrationDrafts.save).toHaveBeenCalledWith(expect.objectContaining({
      email: 'learner@example.com', academicHandle: 'learner.one', encryptedPayload: expect.any(String), expiresAt: expect.any(Date),
    }));
    expect(users.create).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('saves partial onboarding progress inside the encrypted registration draft', async () => {
    const draft = {
      email: user.email,
      academicHandle: 'learner.one',
      encryptedPayload: 'old-encrypted-draft',
      expiresAt: new Date(Date.now() + 60_000),
    };
    registrationTokens.open
      .mockReturnValueOnce({ stage: 'pre-account', email: user.email, jti: 'resume-jti', expiresAt: Date.now() + 60_000 })
      .mockReturnValueOnce({ stage: 'pre-account-draft', email: user.email, firstName: 'Learner', lastName: 'One', academicHandle: 'learner.one', role: UserRole.STUDENT, expiresAt: Date.now() + 60_000 });
    registrationDrafts.findOne.mockResolvedValue(draft);
    registrationTokens.seal.mockReturnValue('updated-encrypted-draft');

    await expect(service.savePreAccountProgress('resume-token', { step: 2, facultySearch: 'Faculty of Science', ignored: 'not persisted' }))
      .resolves.toEqual({ saved: true });

    expect(registrationTokens.seal).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'pre-account-draft',
      onboardingProgress: { step: 2, facultySearch: 'Faculty of Science' },
    }));
    expect(registrationDrafts.save).toHaveBeenCalledWith(expect.objectContaining({
      email: user.email, encryptedPayload: 'updated-encrypted-draft',
    }));
  });

  it('reports academic handle availability and rejects an existing handle', async () => {
    users.findByAcademicHandle.mockResolvedValue(null);
    registrationDrafts.findOne.mockResolvedValue(null);
    await expect(service.checkAcademicHandleAvailability('new.handle')).resolves.toEqual({
      available: true, message: 'Academic handle available',
    });
    users.findByAcademicHandle.mockResolvedValue(user as never);
    await expect(service.checkAcademicHandleAvailability('learner.one')).resolves.toEqual({
      available: false, message: 'Academic handle taken',
    });
  });

  it('authenticates a saved pre-account by email and returns a resumable onboarding token', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    preAccounts.findOne.mockResolvedValue({ email: user.email, password });
    registrationDrafts.findOne.mockResolvedValue({
      email: user.email,
      academicHandle: 'learner.one',
      encryptedPayload: 'encrypted-draft',
      expiresAt: new Date(Date.now() + 60_000),
    });
    registrationTokens.open.mockReturnValue({
      stage: 'pre-account-draft',
      expiresAt: Date.now() + 60_000,
      email: user.email,
      firstName: 'Learner',
      lastName: 'One',
      academicHandle: 'learner.one',
      role: UserRole.STUDENT,
    });
    const response = await service.login({ identifier: user.email, password: 'correct-horse-battery' });
    expect(response).toEqual(expect.objectContaining({
      preAccountRequired: true,
      onboardingToken: expect.any(String),
      preAccount: expect.objectContaining({ email: user.email, academicHandle: 'learner.one', role: UserRole.STUDENT }),
    }));
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('creates the permanent account only after required student onboarding is complete', async () => {
    registrationTokens.open
      .mockReturnValueOnce({ stage: 'pre-account', jti: 'pre-account-jti', expiresAt: Date.now() + 60_000, email: 'learner@example.com' })
      .mockReturnValueOnce({ stage: 'pre-account-draft', expiresAt: Date.now() + 60_000, email: 'learner@example.com', firstName: 'Learner', lastName: 'One', academicHandle: 'learner.one', role: UserRole.STUDENT });
    preAccounts.findOne.mockResolvedValue({ email: 'learner@example.com', password: 'stored-password-hash' });
    registrationDrafts.findOne.mockResolvedValue({ email: 'learner@example.com', academicHandle: 'learner.one', encryptedPayload: 'encrypted-draft', expiresAt: new Date(Date.now() + 60_000) });
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    const response = await service.completePreAccountOnboarding('pre-account-token', {
      institutionId: '00000000-0000-4000-8000-000000000001',
      institution: 'Example University',
      faculty: 'Faculty of Science',
      department: 'Computer Science',
      program: 'B.Sc. Computer Science',
      studyLevel: '300',
    } as never);
    expect(users.createWithManager).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      email: 'learner@example.com', academicHandle: 'learner.one', password: 'stored-password-hash',
      emailVerified: true, isProfileComplete: true, accountStatus: 'active',
      institutionId: '00000000-0000-4000-8000-000000000001',
      faculty: 'Faculty of Science', department: 'Computer Science', studyLevel: '300',
    }));
    expect(preAccounts.delete).toHaveBeenCalledWith({ email: 'learner@example.com' });
    expect(registrationDrafts.delete).toHaveBeenCalledWith({ email: 'learner@example.com' });
    expect(response).toEqual(expect.objectContaining({ accessToken: 'signed-access-token' }));
  });

  it('rejects student onboarding without an academic level before creating an account', async () => {
    registrationTokens.open
      .mockReturnValueOnce({ stage: 'pre-account', jti: 'pre-account-jti', expiresAt: Date.now() + 60_000, email: 'learner@example.com' })
      .mockReturnValueOnce({ stage: 'pre-account-draft', expiresAt: Date.now() + 60_000, email: 'learner@example.com', firstName: 'Learner', lastName: 'One', academicHandle: 'learner.one', role: UserRole.STUDENT });
    preAccounts.findOne.mockResolvedValue({ email: 'learner@example.com', password: 'stored-password-hash' });
    registrationDrafts.findOne.mockResolvedValue({ email: 'learner@example.com', encryptedPayload: 'encrypted-draft', expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.completePreAccountOnboarding('pre-account-token', {
      institutionId: '00000000-0000-4000-8000-000000000001',
      faculty: 'Faculty of Science', department: 'Computer Science',
      program: 'B.Sc. Computer Science',
    } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(users.create).not.toHaveBeenCalled();
    expect(users.createWithManager).not.toHaveBeenCalled();
  });

  it('confirms an unexpired verification token and marks the user email as verified', async () => {
    verificationTokens.findOne.mockResolvedValue({
      id: 'token-1', userId: user.id, tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.findOne.mockResolvedValue({ ...user } as never);
    users.update.mockResolvedValue({ ...user, emailVerified: true } as never);
    const token = 'sample-verification-token';
    const expectedHash = createHash('sha256').update(token).digest('hex');
    verificationTokens.findOne.mockResolvedValue({
      id: 'token-1', userId: user.id, tokenHash: expectedHash, expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.confirmEmailVerification(token, 'correct-horse-battery')).resolves.toEqual({
      message: 'Your email has been verified. You can now sign in to Sophis Central.',
    });
    expect(users.update).toHaveBeenCalledWith(user.id, expect.objectContaining({ emailVerified: true, password: expect.any(String) }));
    expect(verificationTokens.delete).toHaveBeenCalledWith({ userId: user.id });
  });
});
