import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    // These endpoints are unauthenticated and do not rely on ambient session cookies.
    if (['/auth/login', '/auth/signup', '/auth/csrf', '/auth/password-reset/request', '/auth/password-reset/confirm'].includes(request.path)) return true;

    const cookieToken = readCookie(request, 'sophia_csrf_token');
    const headerToken = request.header('X-CSRF-Token');
    if (!cookieToken || !headerToken || cookieToken !== headerToken) throw new ForbiddenException('CSRF validation failed');
    return true;
  }
}
