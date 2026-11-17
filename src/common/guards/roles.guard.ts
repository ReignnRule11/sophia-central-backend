import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // REVIEWER is a capability, not an exclusive primary account role.
    // Other privileged roles continue to use their existing role checks.
    return requiredRoles.some((requiredRole) =>
      requiredRole === 'reviewer'
        ? user.hasReviewerAccess === true || (user.hasReviewerAccess == null && user.role === 'reviewer')
        : requiredRole === user.role,
    );
  }
}
