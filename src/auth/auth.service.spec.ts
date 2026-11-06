import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordResetEmailService } from './password-reset-email.service';
import { EmailVerificationEmailService } from './email-verification-email.service';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<UsersService, 'findByEmail' | 'findByAcademicHandle' | 'create' | 'update' | 'findOne'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let resetTokens: { delete: jest.Mock; save: jest.Mock; create: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let verificationTokens: { delete: jest.Mock; save: jest.Mock; create: jest.Mock; findOne: jest.Mock };
  let resetEmail: jest.Mocked<Pick<PasswordResetEmailService, 'sendResetLink'>>;
  let verificationEmail: jest.Mocked<Pick<EmailVerificationEmailService, 'sendVerificationLink'>>;
  const user = {
    id: 'user-123', email: 'learner@example.com', firstName: 'Learner', lastName: 'One',
    password: '', role: 'student' as const, authProvider: 'email' as const,
    isVerified: false, emailVerified: false, isProfileComplete: false,
  };

  beforeEach(() => {
    users = { findByEmail: jest.fn(), findByAcademicHandle: jest.fn(), create: jest.fn(), update: jest.fn(), findOne: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-access-token') };
    resetTokens = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn().mockResolvedValue({}),
      create: jest.fn((data) => data), findOne: jest.fn(), createQueryBuilder: jest.fn(),
    };
    verificationTokens = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn().mockResolvedValue({}),
      create: jest.fn((data) => data), findOne: jest.fn(),
    };
    resetEmail = { sendResetLink: jest.fn().mockResolvedValue(undefined) };
    verificationEmail = { sendVerificationLink: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      resetTokens as never,
      verificationTokens as never,
      resetEmail as unknown as PasswordResetEmailService,
      verificationEmail as unknown as EmailVerificationEmailService,
      {
        validateReferralCode: jest.fn().mockResolvedValue(undefined),
        redeemReferral: jest.fn().mockResolvedValue({ success: true, message: 'Student referral applied successfully.' }),
      } as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

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

  it('creates an unverified account, sends an activation email, and does not issue a session', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    users.create.mockImplementation(async (data) => ({ ...user, ...data }) as never);
    const response = await service.register({
      firstName: ' Learner ', lastName: ' One ', email: 'LEARNER@example.com',
      password: 'correct-horse-battery', academicHandle: 'learner.one',
    });
    const saved = users.create.mock.calls[0][0];
    expect(saved.email).toBe('learner@example.com');
    expect(saved.emailVerified).toBe(false);
    expect(saved.password).not.toBe('correct-horse-battery');
    expect(await bcrypt.compare('correct-horse-battery', saved.password!)).toBe(true);
    expect(response.emailSent).toBe(true);
    expect(response.user).not.toHaveProperty('password');
    expect(response).not.toHaveProperty('accessToken');
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(verificationTokens.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: user.id, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: expect.any(Date),
    }));
    expect(verificationEmail.sendVerificationLink).toHaveBeenCalledWith(
      user.email, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), user.firstName,
    );
  });

  it('preserves academic and social profile fields during registration', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(null);
    users.create.mockImplementation(async (data) => ({ ...user, ...data }) as never);
    const socialLinks = {
      linkedin: 'https://www.linkedin.com/in/learner-one',
      instagram: 'https://www.instagram.com/learner.one',
      twitter: 'https://x.com/learner_one',
    };
    const response = await service.register({
      firstName: 'Learner', lastName: 'One', email: 'learner@example.com',
      password: 'correct-horse-battery', institution: 'Example University', faculty: 'Science',
      department: 'Computer Science', academicHandle: 'learner.one', socialHandle: 'learner.one', socialLinks,
    });
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({
      institution: 'Example University', faculty: 'Science', department: 'Computer Science',
      academicHandle: 'learner.one', socialHandle: 'learner.one', socialLinks,
    }));
    expect(response.user).toEqual(expect.objectContaining({
      institution: 'Example University', faculty: 'Science', department: 'Computer Science',
      socialHandle: 'learner.one', socialLinks,
    }));
  });

  it('rejects duplicate academic handle registration', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.findByAcademicHandle.mockResolvedValue(user as never);
    await expect(service.register({
      firstName: 'Another', lastName: 'Learner', email: 'another@example.com',
      password: 'correct-horse-battery', academicHandle: '@learner.one',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate email registration', async () => {
    users.findByEmail.mockResolvedValue(user as never);
    await expect(service.register({
      firstName: 'Learner', lastName: 'One', email: 'learner@example.com',
      password: 'correct-horse-battery', academicHandle: 'learner.one',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('blocks password login until the email has been verified', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    users.findByEmail.mockResolvedValue({ ...user, password, emailVerified: false } as never);
    await expect(service.login({ identifier: user.email, password: 'correct-horse-battery' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('allows sign-in with an academic handle for an email-verified account', async () => {
    const password = await bcrypt.hash('correct-horse-battery', 4);
    users.findByAcademicHandle.mockResolvedValue({ ...user, emailVerified: true, academicHandle: 'learner.one', password } as never);
    const response = await service.login({ identifier: '@Learner.One', password: 'correct-horse-battery' });
    expect(users.findByAcademicHandle).toHaveBeenCalledWith('@Learner.One');
    expect(response.user).toHaveProperty('academicHandle', 'learner.one');
    expect(response.user).not.toHaveProperty('password');
  });

  it('returns the same authentication error for unknown email or wrong password', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({ identifier: 'missing@example.com', password: 'not-the-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
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
    await expect(service.confirmEmailVerification(token)).resolves.toEqual({
      message: 'Your email has been verified. You can now sign in to Sophis Central.',
    });
    expect(users.update).toHaveBeenCalledWith(user.id, { emailVerified: true });
    expect(verificationTokens.delete).toHaveBeenCalledWith({ userId: user.id });
  });
});
