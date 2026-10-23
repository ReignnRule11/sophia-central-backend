import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<UsersService, 'findByEmail' | 'create' | 'update' | 'findOne'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;

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
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-access-token') };
    service = new AuthService(users as unknown as UsersService, jwt as unknown as JwtService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('registers with a password hash and does not return the password', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (data) => ({ ...user, ...data }) as never);

    const response = await service.register({
      firstName: ' Learner ',
      lastName: ' One ',
      email: 'LEARNER@example.com',
      password: 'correct-horse-battery',
    });

    const saved = users.create.mock.calls[0][0];
    expect(saved.email).toBe('learner@example.com');
    expect(saved.password).not.toBe('correct-horse-battery');
    expect(await bcrypt.compare('correct-horse-battery', saved.password!)).toBe(true);
    expect(response.accessToken).toBe('signed-access-token');
    expect(response.user).not.toHaveProperty('password');
  });

  it('rejects duplicate email registration', async () => {
    users.findByEmail.mockResolvedValue(user as never);
    await expect(service.register({
      firstName: 'Learner',
      lastName: 'One',
      email: 'learner@example.com',
      password: 'correct-horse-battery',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('returns the same authentication error for unknown email or wrong password', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({
      email: 'missing@example.com',
      password: 'not-the-password',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not mark a user as email-verified during onboarding', async () => {
    users.update.mockResolvedValue({ ...user, isProfileComplete: true } as never);
    const response = await service.completeOnboarding('user-123', {
      institution: 'Example University',
      bio: 'Learner',
    });
    expect(users.update).toHaveBeenCalledWith('user-123', expect.objectContaining({
      institution: 'Example University',
      isProfileComplete: true,
    }));
    expect(users.update.mock.calls[0][1]).not.toHaveProperty('isVerified');
    expect(response.user).not.toHaveProperty('password');
  });
});
