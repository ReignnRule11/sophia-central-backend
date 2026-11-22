import { UserRole } from './entities/user.entity';

export const PLATFORM_LOGIN_ALIASES = Object.freeze({
  admin: 'sophiscentral+admin@gmail.com',
  moderator: 'sophiscentral+moderator@gmail.com',
  support: 'sophiscentral+support@gmail.com',
  reviewer: 'sophiscentral+reviewer@gmail.com',
});

const reservedAliasRoles = new Map<string, UserRole>([
  [PLATFORM_LOGIN_ALIASES.admin, UserRole.ADMIN],
  [PLATFORM_LOGIN_ALIASES.moderator, UserRole.MODERATOR],
  [PLATFORM_LOGIN_ALIASES.support, UserRole.SUPPORT],
  [PLATFORM_LOGIN_ALIASES.reviewer, UserRole.REVIEWER],
]);

export function isReservedPlatformLoginAlias(email: string): boolean {
  return reservedAliasRoles.has(email.trim().toLowerCase());
}

export function isAllowedPlatformLoginAlias(
  email: string,
  role: UserRole | undefined,
  isGlobalReviewer: boolean | undefined,
): boolean {
  const normalized = email.trim().toLowerCase();
  const reservedRole = reservedAliasRoles.get(normalized);
  if (!reservedRole) return true;
  if (role !== reservedRole) return false;
  return normalized !== PLATFORM_LOGIN_ALIASES.reviewer || isGlobalReviewer === true;
}
