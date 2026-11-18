import { User } from './entities/user.entity';

/**
 * Global academic governance is an additional, revocable reviewer capability.
 * It never substitutes for an active reviewer approval or active account.
 */
export function hasActiveGlobalReviewerAuthority(user: Partial<User>): boolean {
  return user.isGlobalReviewer === true
    && user.hasReviewerAccess === true
    && user.reviewerStatus === 'approved'
    && user.isSuspended !== true
    && (user.accountStatus === undefined || user.accountStatus === 'active');
}
