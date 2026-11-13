import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { ConfigService } from '@nestjs/config';

describe('JwtStrategy email verification enforcement', () => {
  const config = { get: jest.fn((key: string) => key === 'NODE_ENV' ? 'test' : undefined) };
  let users: { findOne: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    users = { findOne: jest.fn() };
    strategy = new JwtStrategy(users as unknown as UsersService, config as unknown as ConfigService);
  });

  it('rejects JWTs for accounts without explicit email verification', async () => {
    users.findOne.mockResolvedValue({ id: 'user-1', emailVerified: false, isSuspended: false, accountStatus: 'active' });
    await expect(strategy.validate({ sub: 'user-1' })).resolves.toBeNull();
    users.findOne.mockResolvedValue({ id: 'user-1', emailVerified: undefined, isSuspended: false, accountStatus: 'active' });
    await expect(strategy.validate({ sub: 'user-1' })).resolves.toBeNull();
  });

  it('accepts a JWT only when the account email is explicitly verified and active', async () => {
    const verifiedUser = { id: 'user-1', emailVerified: true, isSuspended: false, accountStatus: 'active' };
    users.findOne.mockResolvedValue(verifiedUser);
    await expect(strategy.validate({ sub: 'user-1' })).resolves.toBe(verifiedUser);
  });

  it('rejects missing, suspended, or inactive users', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'missing' })).resolves.toBeNull();
    users.findOne.mockResolvedValue({ id: 'user-1', emailVerified: true, isSuspended: true, accountStatus: 'active' });
    await expect(strategy.validate({ sub: 'user-1' })).resolves.toBeNull();
    users.findOne.mockResolvedValue({ id: 'user-1', emailVerified: true, isSuspended: false, accountStatus: 'deactivated' });
    await expect(strategy.validate({ sub: 'user-1' })).resolves.toBeNull();
  });
});
