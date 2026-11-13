import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationTokenService } from './registration-token.service';

describe('RegistrationTokenService', () => {
  const config = {
    get: (key: string) => key === 'JWT_SECRET' ? 'a-production-secret-that-is-at-least-thirty-two-characters' : 'production',
  } as ConfigService;
  const service = new RegistrationTokenService(config);

  it('encrypts registration data and opens it only with the application secret', () => {
    const payload = { stage: 'verify' as const, expiresAt: Date.now() + 60_000, email: 'private@example.com', firstName: 'Private' };
    const token = service.seal(payload);
    expect(token).not.toContain('private@example.com');
    expect(service.open(token)).toEqual(payload);
  });

  it('rejects tampered, malformed and expired registration tokens', () => {
    expect(() => service.open('not-a-token')).toThrow(UnauthorizedException);
    const expired = service.seal({ stage: 'verify', expiresAt: Date.now() - 1, email: 'private@example.com' });
    expect(() => service.open(expired)).toThrow(UnauthorizedException);
  });
});
