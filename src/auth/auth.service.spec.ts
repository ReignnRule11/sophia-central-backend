import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordResetEmailService } from './password-reset-email.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'create' | 'update' | 'findOne'>
  >;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let resetTokens: { delete: jest.Mock; save: jest.Mock; create: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let resetEmail: jest.Mocked<Pick<PasswordResetEmailService, 'sendResetLink'>>;

  const user = {
    id: 'user-123',
    email: 'learner@example.com',
    firstName: 'Learner',
    lastName: 'One',
    password: '',
    role: 'student' as const,
    authProvider: 'email' as const,
    isVerified: false,
    isProfileComplete: false,
  };

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
    };

    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-access-token'),
    };

    resetTokens = { delete: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn().mockResolvedValue({}), create: jest.fn((data) => data), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    resetEmail = { sendResetLink: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      resetTokens as never,
      resetEmail as unknown as PasswordResetEmailService,
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
      userId: user.id,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
    }));
    const tokenRecord = resetTokens.save.mock.calls[0][0];
    expect(tokenRecord.tokenHash).not.toContain('token');
    expect(resetEmail.sendResetLink).toHaveBeenCalledWith(user.email, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
  });

  it('registers with a password hash and does not return the password', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(
      async (data) => ({ ...user, ...data }) as never,
    );

    const response = await service.register({
      firstName: ' Learner ',
      lastName: ' One ',
      email: 'LEARNER@example.com',
      password: 'correct-horse-battery',
    });

    const saved = users.create.mock.calls[0][0];

    expect(saved.email).toBe('learner@example.com');
    expect(saved.password).not.toBe('correct-horse-battery');
    expect(
      await bcrypt.compare('correct-horse-battery', saved.password!),
    ).toBe(true);
    expect(response.accessToken).toBe('signed-access-token');
    expect(response.user).not.toHaveProperty('password');
  });

  it('saves and returns academic and social profile fields during registration', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(
      async (data) => ({ ...user, ...data }) as never,
    );

    const socialLinks = {
      linkedin: 'https://www.linkedin.com/in/learner-one',
      instagram: 'https://www.instagram.com/learner.one',
      twitter: 'https://x.com/learner_one',
    };

    const response = await service.register({
      firstName: 'Learner',
      lastName: 'One',
      email: 'learner@example.com',
      password: 'correct-horse-battery',
      institution: 'Example University',
      faculty: 'Science',
      department: 'Computer Science',
      socialHandle: 'learner.one',
      socialLinks,
    });

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        institution: 'Example University',
        faculty: 'Science',
        department: 'Computer Science',
        socialHandle: 'learner.one',
        socialLinks,
      }),
    );

    expect(response.user).toEqual(
      expect.objectContaining({
        institution: 'Example University',
        faculty: 'Science',
        department: 'Computer Science',
        socialHandle: 'learner.one',
        socialLinks,
      }),
    );

    expect(response.user).not.toHaveProperty('password');
  });

  it('rejects duplicate email registration', async () => {
    users.findByEmail.mockResolvedValue(user as never);

    await expect(
      service.register({
        firstName: 'Learner',
        lastName: 'One',
        email: 'learner@example.com',
        password: 'correct-horse-battery',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(users.create).not.toHaveBeenCalled();
  });

  it('returns the same authentication error for unknown email or wrong password', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'not-the-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not mark a user as email-verified during onboarding', async () => {
    users.update.mockResolvedValue(
      { ...user, isProfileComplete: true } as never,
    );

    const response = await service.completeOnboarding('user-123', {
      institution: 'Example University',
      bio: 'Learner',
    });

    expect(users.update).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        institution: 'Example University',
        isProfileComplete: true,
      }),
    );

    expect(users.update.mock.calls[0][1]).not.toHaveProperty('isVerified');
    expect(response.user).not.toHaveProperty('password');
  });
});
