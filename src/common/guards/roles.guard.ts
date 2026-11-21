import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { UserRole } from '../../users/entities/user.entity';

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
    return requiredRoles.some((requiredRole) => {
      if (requiredRole === UserRole.REVIEWER) {
        return user.hasReviewerAccess === true || (user.hasReviewerAccess == null && user.role === UserRole.REVIEWER);
      }
      if (requiredRole === UserRole.SUPPORT || requiredRole === UserRole.MODERATOR) {
        // Platform-owned workspaces remain inaccessible until an Admin explicitly
        // approves the already-provisioned account. JwtStrategy reloads this user
        // from the database for each request, so this is not a stale token claim.
        return requiredRole === user.role && Boolean(user.platformRoleVerifiedAt);
      }
      return requiredRole === user.role;
    });
  }
}
