import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();
  const contextFor = (request: {
    method: string;
    path: string;
    headers?: { cookie?: string };
    header: (name: string) => string | undefined;
  }) => ({
    ...request,
    headers: request.headers ?? {},
    switchToHttp: () => ({ getRequest: () => ({ ...request, headers: request.headers ?? {} }) }),
  }) as unknown as ExecutionContext;

  it('allows safe methods without a CSRF token', () => {
    expect(guard.canActivate(contextFor({ method: 'GET', path: '/users/me', header: () => undefined }))).toBe(true);
    expect(guard.canActivate(contextFor({ method: 'OPTIONS', path: '/users/me', header: () => undefined }))).toBe(true);
  });

  it('allows explicitly exempt unauthenticated endpoints', () => {
    expect(guard.canActivate(contextFor({ method: 'POST', path: '/auth/login', header: () => undefined }))).toBe(true);
  });

  it('rejects missing or mismatched double-submit tokens', () => {
    const missing = contextFor({ method: 'POST', path: '/chat/messages', header: () => undefined });
    expect(() => guard.canActivate(missing)).toThrow(ForbiddenException);
    const mismatch = contextFor({
      method: 'POST',
      path: '/chat/messages',
      headers: { cookie: 'sophia_csrf_token=cookie-token' },
      header: () => 'different-token',
    });
    expect(() => guard.canActivate(mismatch)).toThrow(ForbiddenException);
  });

  it('accepts matching cookie and request-header tokens', () => {
    const context = contextFor({
      method: 'POST',
      path: '/chat/messages',
      headers: { cookie: 'sophia_csrf_token=token-123' },
      header: () => 'token-123',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('fails closed for malformed percent-encoded cookie values', () => {
    const context = contextFor({
      method: 'POST',
      path: '/chat/messages',
      headers: { cookie: 'sophia_csrf_token=%E0%A4%A' },
      header: () => '%E0%A4%A',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
