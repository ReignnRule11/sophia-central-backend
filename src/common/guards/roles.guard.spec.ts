import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('RolesGuard reviewer capability', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as never);

  const contextFor = (user: unknown) => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

  beforeEach(() => jest.clearAllMocks());

  it('allows an approved Student with reviewer capability to access reviewer routes', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.REVIEWER]);
    expect(guard.canActivate(contextFor({
      id: 'student-1',
      role: UserRole.STUDENT,
      hasReviewerAccess: true,
      reviewerStatus: 'approved',
    }))).toBe(true);
  });

  it('allows an approved Lecturer with reviewer capability to access reviewer routes', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.REVIEWER]);
    expect(guard.canActivate(contextFor({
      id: 'lecturer-1',
      role: UserRole.LECTURER,
      hasReviewerAccess: true,
      reviewerStatus: 'approved',
    }))).toBe(true);
  });

  it('denies Student and Lecturer accounts without reviewer capability', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.REVIEWER]);
    expect(guard.canActivate(contextFor({ role: UserRole.STUDENT, hasReviewerAccess: false }))).toBe(false);
    expect(guard.canActivate(contextFor({ role: UserRole.LECTURER, hasReviewerAccess: false }))).toBe(false);
  });

  it('denies suspended or revoked reviewer accounts after access is removed', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.REVIEWER]);
    expect(guard.canActivate(contextFor({ role: UserRole.STUDENT, hasReviewerAccess: false, reviewerStatus: 'suspended' }))).toBe(false);
    expect(guard.canActivate(contextFor({ role: UserRole.REVIEWER, hasReviewerAccess: false, reviewerStatus: 'revoked' }))).toBe(false);
  });

  it('preserves normal role matching for non-reviewer routes', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.LECTURER]);
    expect(guard.canActivate(contextFor({ role: UserRole.LECTURER, hasReviewerAccess: false }))).toBe(true);
    expect(guard.canActivate(contextFor({ role: UserRole.STUDENT, hasReviewerAccess: true }))).toBe(false);
  });

  it('blocks the existing Moderator until an Admin approves its platform identity', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.MODERATOR]);
    expect(guard.canActivate(contextFor({ role: UserRole.MODERATOR }))).toBe(false);
    expect(guard.canActivate(contextFor({ role: UserRole.MODERATOR, platformRoleVerifiedAt: new Date(), platformRoleStatus: 'approved' }))).toBe(true);
    expect(guard.canActivate(contextFor({ role: UserRole.MODERATOR, platformRoleVerifiedAt: new Date(), platformRoleStatus: 'revoked' }))).toBe(false);
  });

  it('blocks Support accounts until an Admin approves their platform identity', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SUPPORT]);
    expect(guard.canActivate(contextFor({ role: UserRole.SUPPORT }))).toBe(false);
    expect(guard.canActivate(contextFor({ role: UserRole.SUPPORT, platformRoleVerifiedAt: new Date(), platformRoleStatus: 'approved' }))).toBe(true);
    expect(guard.canActivate(contextFor({ role: UserRole.SUPPORT, platformRoleVerifiedAt: new Date(), platformRoleStatus: 'suspended' }))).toBe(false);
  });

  it('never converts reviewer capability into Admin, Moderator, or Support access', () => {
    const reviewer = { id: 'reviewer-1', role: UserRole.STUDENT, hasReviewerAccess: true };
    for (const privilegedRole of [UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT]) {
      reflector.getAllAndOverride.mockReturnValue([privilegedRole]);
      expect(guard.canActivate(contextFor(reviewer))).toBe(false);
    }
  });

  it('does not let a Reviewer primary role inherit Admin or platform-workspace access', () => {
    const reviewer = { id: 'reviewer-2', role: UserRole.REVIEWER, hasReviewerAccess: true };
    for (const privilegedRole of [UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT]) {
      reflector.getAllAndOverride.mockReturnValue([privilegedRole]);
      expect(guard.canActivate(contextFor(reviewer))).toBe(false);
    }
  });
});
