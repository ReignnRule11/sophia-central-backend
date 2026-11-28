import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Institution } from '../institutions/entities/institution.entity';
import { generateInstitutionCode, institutionTypeCode } from '../institutions/institution-code';
import { StorageCleanupService } from '../upload/storage-cleanup.service';
import { SetReviewerAccessDto } from './dto/set-reviewer-access.dto';
import { TransitionExternalReviewerDto } from './dto/transition-external-reviewer.dto';
import { isAllowedPlatformLoginAlias, PLATFORM_LOGIN_ALIASES } from './platform-login-aliases';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(Institution) private readonly institutionRepository: Repository<Institution>,
    private readonly dataSource: DataSource,
    private readonly storageCleanup: StorageCleanupService,
  ) {}

  private async generateUniqueId(data: Partial<User>, institution?: Institution | null, manager?: EntityManager): Promise<string> {
    const usersRepository = manager ? manager.getRepository(User) : this.usersRepository;
    const accountRole = data.role ?? UserRole.STUDENT;
    const baseRole = accountRole === UserRole.REVIEWER ? data.reviewerBaseRole : accountRole;
    const roleCode = baseRole === UserRole.LECTURER ? 'LEC'
      : baseRole === UserRole.STUDENT ? 'STU'
      : accountRole === UserRole.REVIEWER ? 'REV'
      : accountRole === UserRole.ADMIN ? 'ADM' : 'SYS';
    if ([UserRole.STUDENT, UserRole.LECTURER].includes(accountRole) && !institution) {
      throw new BadRequestException('Choose an institution from the Sophis Central catalogue before creating your account.');
    }
    const institutionPart = institution
      ? `${institutionTypeCode(institution.institutionType)}-${institution.institutionCode || generateInstitutionCode(institution.name, institution.institutionType, institution.id)}`
      : 'PLT';
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = Array.from(randomBytes(10), (byte) => alphabet[byte & 31]).join('');
      const candidate = `SC-${institutionPart}-${roleCode}-${suffix}`;
      if (!await usersRepository.exist({ where: { uniqueId: candidate } })) return candidate;
    }
    throw new ConflictException('A unique Sophis Central Institution ID could not be generated. Please retry registration.');
  }

  private assertReservedLoginAlias(data: Partial<User>): void {
    if (!data.email || isAllowedPlatformLoginAlias(data.email, data.role, data.isGlobalReviewer)) return;
    throw new ConflictException('This email address is reserved for its designated Sophis Central platform account.');
  }

  async create(data: Partial<User>): Promise<User> {
    this.assertReservedLoginAlias(data);
    if (data.email?.trim().toLowerCase() === PLATFORM_LOGIN_ALIASES.reviewer && data.isGlobalReviewer === true
      && await this.usersRepository.exist({ where: { isGlobalReviewer: true } })) {
      throw new ConflictException('The Global Reviewer identity already exists. Its login alias must be transferred to that account, not used to create another one.');
    }
    const institution = data.institutionId
      ? await this.institutionRepository.findOne({ where: { id: data.institutionId } })
      : null;
    if (data.institutionId && !institution) throw new BadRequestException('The selected institution is not in the approved Sophis Central catalogue.');
    const uniqueId = await this.generateUniqueId(data, institution);
    return this.usersRepository.save(this.usersRepository.create({
      ...data,
      ...(institution ? { institution: institution.name } : {}),
      academicAccountType: data.academicAccountType ?? (data.role === UserRole.STUDENT ? 'student' : data.role === UserRole.LECTURER ? 'lecturer' : data.role === UserRole.REVIEWER ? 'external_reviewer' : undefined),
      uniqueId,
    }));
  }

  async createWithManager(manager: EntityManager, data: Partial<User>): Promise<User> {
    this.assertReservedLoginAlias(data);
    if (data.email?.trim().toLowerCase() === PLATFORM_LOGIN_ALIASES.reviewer && data.isGlobalReviewer === true
      && await manager.getRepository(User).exist({ where: { isGlobalReviewer: true } })) {
      throw new ConflictException('The Global Reviewer identity already exists. Its login alias must be transferred to that account, not used to create another one.');
    }
    if (data.academicHandle && data.email) {
      const reserved = await manager.query(
        'SELECT email FROM registration_drafts WHERE LOWER("academicHandle") = $1 AND email <> $2 LIMIT 1',
        [data.academicHandle.trim().replace(/^@+/, '').toLowerCase(), data.email.trim().toLowerCase()],
      );
      if (reserved.length) throw new ConflictException('Academic handle taken');
    }
    const institution = data.institutionId
      ? await manager.getRepository(Institution).findOne({ where: { id: data.institutionId } })
      : null;
    if (data.institutionId && !institution) throw new BadRequestException('The selected institution is not in the approved Sophis Central catalogue.');
    const uniqueId = await this.generateUniqueId(data, institution, manager);
    return manager.getRepository(User).save(manager.getRepository(User).create({
      ...data,
      ...(institution ? { institution: institution.name } : {}),
      academicAccountType: data.academicAccountType ?? (data.role === UserRole.STUDENT ? 'student' : data.role === UserRole.LECTURER ? 'lecturer' : data.role === UserRole.REVIEWER ? 'external_reviewer' : undefined),
      uniqueId,
    }));
  }

  async transitionExternalReviewer(userId: string, dto: TransitionExternalReviewerDto): Promise<User> {
    return this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('User not found.');
      if (user.role !== UserRole.REVIEWER || user.academicAccountType !== 'external_reviewer') {
        throw new ConflictException('Only an External Reviewer account that has not previously selected an academic account type can use this transition.');
      }
      if (user.hasReviewerAccess !== true || user.reviewerStatus !== 'approved') {
        throw new ForbiddenException('Your Academic Reviewer application must be approved before you can add a Student or Lecturer workspace.');
      }
      const institution = await manager.findOne(Institution, { where: { id: dto.institutionId } });
      if (!institution) throw new BadRequestException('Select an institution from the approved Sophis Central catalogue.');
      if (!dto.faculty.trim() || !dto.department.trim()) {
        throw new BadRequestException('Faculty and department are required for the selected academic account.');
      }
      if (dto.targetRole === UserRole.STUDENT && (!dto.program?.trim() || !dto.studyLevel?.trim())) {
        throw new BadRequestException('Student access requires a programme and current academic level.');
      }
      if (dto.targetRole === UserRole.LECTURER && (!dto.coursesTaught?.length || !dto.teachingAssignments?.length)) {
        throw new BadRequestException('Lecturer access requires at least one course taught with its course code and academic level.');
      }

      const fromAccountType = user.academicAccountType;
      user.role = dto.targetRole;
      user.academicAccountType = dto.targetRole;
      user.institutionId = institution.id;
      user.institution = institution.name;
      user.faculty = dto.faculty.trim();
      user.department = dto.department.trim();
      user.program = dto.targetRole === UserRole.STUDENT ? dto.program?.trim() : undefined;
      user.studyLevel = dto.targetRole === UserRole.STUDENT ? dto.studyLevel?.trim() : undefined;
      user.coursesTaught = dto.targetRole === UserRole.LECTURER ? dto.coursesTaught : [];
      user.teachingAssignments = dto.targetRole === UserRole.LECTURER ? dto.teachingAssignments : [];
      user.isProfileComplete = true;
      // Reviewer approval and expertise survive the one-way academic identity conversion.
      user.hasReviewerAccess = true;
      user.reviewerStatus = 'approved';

      const saved = await manager.save(User, user);
      await manager.query(
        'INSERT INTO academic_account_transitions ("userId", "fromAccountType", "toAccountType", "actorId") VALUES ($1::uuid, $2, $3, $4::uuid)',
        [user.id, fromAccountType, dto.targetRole, user.id],
      );
      return saved;
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.createQueryBuilder('user').addSelect('user.password')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() }).getOne();
  }

  async findByUniqueId(uniqueId: string): Promise<User | null> {
    const normalized = uniqueId.trim().toUpperCase();
    return this.usersRepository.createQueryBuilder('user').addSelect('user.password')
      .where('UPPER(user.uniqueId) = :uniqueId', { uniqueId: normalized }).getOne();
  }

  async findByAcademicHandle(handle: string): Promise<User | null> {
    const normalized = handle.trim().replace(/^@/, '').toLowerCase();
    return this.usersRepository.createQueryBuilder('user').addSelect('user.password')
      .where('LOWER(user.academicHandle) = :handle', { handle: normalized }).getOne();
  }

  async findOne(id: string): Promise<User | null> {
    if (!id) return null;
    return this.usersRepository.findOne({ where: { id } });
  }

  async hasGlobalReviewerAccount(): Promise<boolean> {
    return this.usersRepository.exist({ where: { isGlobalReviewer: true } });
  }

  async findChatContacts(currentUserId: string, search?: string) {
    const currentUser = await this.usersRepository.findOne({
      where: { id: currentUserId },
      select: ['id', 'institution'],
    });
    const institution = currentUser?.institution?.trim();
    if (!institution) return [];

    const query = this.usersRepository.createQueryBuilder('user')
      .select(['user.id', 'user.academicHandle', 'user.role', 'user.institution', 'user.faculty', 'user.department'])
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere('LOWER(TRIM(user.institution)) = LOWER(TRIM(:institution))', { institution })
      .andWhere('user.role IN (:...roles)', { roles: [UserRole.STUDENT, UserRole.LECTURER] })
      .andWhere('user.isSuspended = false')
      .andWhere("user.accountStatus = 'active'")      .andWhere('user.academicHandle IS NOT NULL');
    const normalizedSearch = search?.trim().replace(/^@+/, '').toLowerCase();
    if (normalizedSearch) query.andWhere('LOWER(user.academicHandle) LIKE :search', { search: `%${normalizedSearch}%` });
    return query.orderBy('user.academicHandle', 'ASC').take(50).getMany();
  }

  private async assertActiveAdmin(adminId: string, manager?: EntityManager): Promise<void> {
    const admin = await (manager ? manager.findOne(User, {
      where: { id: adminId },
      select: ['id', 'role', 'emailVerified', 'isSuspended', 'accountStatus'],
    }) : this.usersRepository.findOne({
      where: { id: adminId },
      select: ['id', 'role', 'emailVerified', 'isSuspended', 'accountStatus'],
    }));
    if (!admin || admin.role !== UserRole.ADMIN || admin.emailVerified !== true ||
        admin.isSuspended === true || admin.accountStatus !== 'active') {
      throw new ForbiddenException('An active, email-verified Admin account is required for this operation.');
    }
  }

  async getAdminOverview(adminId: string) {
    await this.assertActiveAdmin(adminId);
    const [totals] = await this.dataSource.query(
      `SELECT
        COUNT(*)::int AS "registeredAccounts",
        COUNT(*) FILTER (WHERE "emailVerified" = true AND "accountStatus" = 'active' AND "isSuspended" = false)::int AS "activeVerifiedAccounts",
        COUNT(*) FILTER (WHERE role = 'student')::int AS students,
        COUNT(*) FILTER (WHERE role = 'lecturer')::int AS lecturers,
        COUNT(*) FILTER (WHERE role = 'reviewer')::int AS "externalReviewerAccounts",
        COUNT(*) FILTER (WHERE role = 'admin')::int AS administrators
       FROM users       WHERE role NOT IN ('moderator', 'support')`,    );
    const [platform] = await this.dataSource.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "platformRoleStatus" = 'pending')::int AS "pendingApproval",
        COUNT(*) FILTER (WHERE "platformRoleStatus" = 'approved')::int AS "approved",
        COUNT(*) FILTER (WHERE "platformRoleStatus" = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE "platformRoleStatus" = 'revoked')::int AS revoked,
        COUNT(*) FILTER (WHERE "isSuspended" = true OR "accountStatus" <> 'active')::int AS "unavailable"
       FROM users WHERE role IN ('moderator', 'support')`,
    );

    const reviewerStatuses = await this.dataSource.query(
      `SELECT status, COUNT(*)::int AS count
       FROM reviewer_applications
       GROUP BY status`,
    );
    const globalReviewerRows = await this.dataSource.query(
      `SELECT id, email, "firstName", "lastName", role, "hasReviewerAccess",
              "isGlobalReviewer", "reviewerStatus", "emailVerified", "isSuspended",
              "accountStatus", "createdAt", "lastLoginAt"
       FROM users
       WHERE "isGlobalReviewer" = true
       ORDER BY "createdAt" ASC
       LIMIT 1`,
      [],
    );
    const globalReviewer = globalReviewerRows[0] ?? null;
    let globalReviewerApplicationHistory = 0;
    let globalReviewerModerationReviewCount = 0;
    let globalReviewerAssignmentEventCount = 0;
    let globalReviewerLatestApplication: Record<string, unknown> | null = null;
    let globalReviewerLatestModerationReview: Record<string, unknown> | null = null;
    if (globalReviewer?.id) {
      const [history] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM reviewer_applications WHERE "userId" = $1::uuid`,
        [globalReviewer.id],
      );
      globalReviewerApplicationHistory = Number(history?.count ?? 0);
      const [latest] = await this.dataSource.query(
        `SELECT id, status, "createdAt", "updatedAt", "decidedAt", "decisionNote"
         FROM reviewer_applications WHERE "userId" = $1::uuid
         ORDER BY "createdAt" DESC LIMIT 1`,
        [globalReviewer.id],
      );
      globalReviewerLatestApplication = latest ?? null;
      const [reviewCounts] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM moderation_reviews WHERE "reviewerId" = $1::uuid`,
        [globalReviewer.id],
      );
      globalReviewerModerationReviewCount = Number(reviewCounts?.count ?? 0);
      const [assignmentCounts] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM reviewer_assignment_events WHERE "reviewerId" = $1::uuid`,
        [globalReviewer.id],
      );
      globalReviewerAssignmentEventCount = Number(assignmentCounts?.count ?? 0);
      const [latestReview] = await this.dataSource.query(
        `SELECT review.id, review.status, review."createdAt", resource.id AS "resourceId", resource.title AS "resourceTitle"
         FROM moderation_reviews review
         LEFT JOIN resources resource ON resource.id = review."resourceId"
         WHERE review."reviewerId" = $1::uuid
         ORDER BY review."createdAt" DESC LIMIT 1`,
        [globalReviewer.id],
      );
      globalReviewerLatestModerationReview = latestReview ?? null;
    }

    const admin = await this.usersRepository.findOne({
      where: { id: adminId },
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'emailVerified', 'isSuspended', 'accountStatus'],
    });

    return {
      generatedAt: new Date().toISOString(),
      admin,
      accounts: totals,
      platformAccounts: platform,
      reviewerApplications: reviewerStatuses.reduce((result: Record<string, number>, row: { status: string; count: number }) => {
        result[row.status] = Number(row.count);
        return result;
      }, {}),
      globalReviewer: globalReviewer ? {
        ...globalReviewer,
        applicationHistoryCount: globalReviewerApplicationHistory,
        moderationReviewCount: globalReviewerModerationReviewCount,
        assignmentEventCount: globalReviewerAssignmentEventCount,
        latestApplication: globalReviewerLatestApplication,
        latestModerationReview: globalReviewerLatestModerationReview,
      } : null,
    };
  }

  async getAdminAuditEvents(adminId: string, limit = 50) {
    await this.assertActiveAdmin(adminId);
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)));
    return this.dataSource.query(
      `SELECT * FROM (
        SELECT
          'platform_role'::text AS "eventType",
          event.action::text AS action,
          event.role::text AS role,
          event."actorId"::text AS "actorId",
          NULLIF(CONCAT_WS(' ', actor."firstName", actor."lastName"), '') AS "actorName",
          COALESCE(actor.email, event."actorEmail") AS "actorEmail",
          event."targetId"::text AS "targetId",
          NULLIF(CONCAT_WS(' ', target."firstName", target."lastName"), '') AS "targetName",
          COALESCE(target.email, event."targetEmail") AS "targetEmail",
          event."createdAt" AS "createdAt",
          event.reason::text AS note,
          event.id::text AS id
        FROM platform_role_audit_events event
        LEFT JOIN users actor ON actor.id = event."actorId"
        LEFT JOIN users target ON target.id = event."targetId"

        UNION ALL

        SELECT
          'reviewer_application'::text AS "eventType",
          decision."toStatus"::text AS action,
          'reviewer'::text AS role,
          decision."actorId"::text AS "actorId",
          NULLIF(CONCAT_WS(' ', actor."firstName", actor."lastName"), '') AS "actorName",
          actor.email AS "actorEmail",
          application."userId"::text AS "targetId",
          NULLIF(CONCAT_WS(' ', applicant."firstName", applicant."lastName"), '') AS "targetName",
          applicant.email AS "targetEmail",
          decision."createdAt" AS "createdAt",
          decision.note AS note,
          decision.id::text AS id
        FROM reviewer_application_decisions decision
        INNER JOIN reviewer_applications application ON application.id = decision."applicationId"
        LEFT JOIN users actor ON actor.id = decision."actorId"
        LEFT JOIN users applicant ON applicant.id = application."userId"

        UNION ALL

        SELECT
          'admin_bootstrap'::text AS "eventType",
          bootstrap.action::text AS action,
          'admin'::text AS role,
          NULL::text AS "actorId",
          'Controlled bootstrap'::text AS "actorName",
          NULL::text AS "actorEmail",
          bootstrap."targetId"::text AS "targetId",
          NULLIF(CONCAT_WS(' ', target."firstName", target."lastName"), '') AS "targetName",
          COALESCE(target.email, bootstrap.email) AS "targetEmail",
          bootstrap."createdAt" AS "createdAt",
          NULL::text AS note,
          bootstrap.id::text AS id
        FROM admin_bootstrap_audit_events bootstrap
        LEFT JOIN users target ON target.id = bootstrap."targetId"

        UNION ALL

        SELECT
          'admin_mfa'::text AS "eventType",
          mfa.action::text AS action,
          'admin'::text AS role,
          mfa."targetId"::text AS "actorId",
          'Admin MFA'::text AS "actorName",
          COALESCE(mfa."actorEmail", mfa.email)::text AS "actorEmail",
          mfa."targetId"::text AS "targetId",
          NULL::text AS "targetName",
          mfa.email::text AS "targetEmail",
          mfa."createdAt" AS "createdAt",
          COALESCE(mfa.reason, mfa.method)::text AS note,
          mfa.id::text AS id
        FROM admin_mfa_audit_events mfa

        UNION ALL

        SELECT
          'reviewer_assignment'::text AS "eventType",
          assignment."eventType"::text AS action,
          'reviewer'::text AS role,
          assignment."actorId"::text AS "actorId",
          NULLIF(CONCAT_WS(' ', actor."firstName", actor."lastName"), '') AS "actorName",
          actor.email AS "actorEmail",
          assignment."reviewerId"::text AS "targetId",
          NULLIF(CONCAT_WS(' ', reviewer."firstName", reviewer."lastName"), '') AS "targetName",          reviewer.email AS "targetEmail",
          assignment."createdAt" AS "createdAt",
          assignment."reviewStatus"::text AS note,
          assignment.id::text AS id
        FROM reviewer_assignment_events assignment
        LEFT JOIN users actor ON actor.id = assignment."actorId"
        LEFT JOIN users reviewer ON reviewer.id = assignment."reviewerId"

        UNION ALL

        SELECT
          'resource_review'::text AS "eventType",
          review.status::text AS action,
          'reviewer'::text AS role,          review."reviewerId"::text AS "actorId",          NULLIF(CONCAT_WS(' ', reviewer."firstName", reviewer."lastName"), '') AS "actorName",
          reviewer.email AS "actorEmail",          review."resourceId"::text AS "targetId",
          resource.title::text AS "targetName",
          NULL::text AS "targetEmail",
          review."createdAt" AS "createdAt",
          review.note AS note,
          review.id::text AS id
        FROM moderation_reviews review
        LEFT JOIN users reviewer ON reviewer.id = review."reviewerId"
        LEFT JOIN resources resource ON resource.id = review."resourceId"

        UNION ALL

        SELECT
          'admin_escalation'::text AS "eventType",
          escalation."sourceType"::text AS action,
          escalation."sourceType"::text AS role,
          escalation."actorId"::text AS "actorId",
          NULL::text AS "actorName",
          escalation."actorEmail" AS "actorEmail",
          escalation."sourceId"::text AS "targetId",
          escalation."ticketNumber"::text AS "targetName",
          NULL::text AS "targetEmail",
          escalation."createdAt" AS "createdAt",
          escalation.reason AS note,
          escalation.id::text AS id
        FROM admin_escalation_events escalation
      ) events
      ORDER BY "createdAt" DESC
      LIMIT $1`,
      [safeLimit],
    );
  }

  async getPlatformAccounts(adminId: string) {
    await this.assertActiveAdmin(adminId);
    return this.usersRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.firstName', 'user.lastName', 'user.role', 'user.isVerified', 'user.emailVerified', 'user.isSuspended', 'user.accountStatus', 'user.platformRoleVerifiedAt', 'user.platformRoleStatus', 'user.createdAt'])
      .where('user.role IN (:...roles)', { roles: [UserRole.SUPPORT, UserRole.MODERATOR] })
      .orderBy('user.role', 'ASC')
      .getMany();
  }

  async assignPlatformRole(actorId: string, targetId: string, role: UserRole.SUPPORT | UserRole.MODERATOR): Promise<User> {
    return this.dataSource.transaction(async manager => {
      await this.assertActiveAdmin(actorId, manager);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sophis-central-platform-role:${role}`]);
      const target = await manager.findOne(User, { where: { id: targetId }, lock: { mode: 'pessimistic_write' } });
      if (!target) throw new NotFoundException('The selected platform account was not found.');

      // Platform identity is provisioned separately. Admin approval must never convert
      // an ordinary academic account into a shared platform account.
      if (target.role !== role) {
        throw new ConflictException(`Only an already-provisioned ${role} account can be Admin-verified here. Ordinary accounts cannot be promoted through account linking.`);
      }
      const designatedLoginEmail = role === UserRole.MODERATOR
        ? 'sophiscentral+moderator@gmail.com'
        : 'sophiscentral+support@gmail.com';
      if (target.email.trim().toLowerCase() !== designatedLoginEmail) {
        throw new ConflictException(`The designated ${role} account must use its reserved Sophis Central login alias before Admin approval.`);
      }
      if (target.emailVerified !== true || target.accountStatus !== 'active' || target.isSuspended === true) {
        throw new ForbiddenException('Only an email-verified, active, unsuspended platform account can be approved.');
      }
      if (target.hasReviewerAccess === true) {
        throw new ConflictException('An account with separate Academic Reviewer privileges cannot be a Support or Moderator platform account.');
      }

      const existing = await manager.findOne(User, { where: { role }, lock: { mode: 'pessimistic_write' } });
      if (!existing || existing.id !== target.id) {
        throw new ConflictException(`The designated ${role} account could not be confirmed. Review platform account provisioning.`);
      }
      if (target.platformRoleStatus === 'approved' && target.platformRoleVerifiedAt) return target;

      target.platformRoleVerifiedAt = new Date();
      target.platformRoleStatus = 'approved';
      const saved = await manager.save(User, target);
      await manager.query(
        'INSERT INTO platform_role_audit_events ("actorId", "targetId", role, action, "previousRole", "newRole", reason, "actorEmail", "targetEmail") SELECT $1::uuid, $2::uuid, $3, $4, $5, $6, $7, actor.email, target.email FROM users actor CROSS JOIN users target WHERE actor.id = $1::uuid AND target.id = $2::uuid',
        [actorId, target.id, role, 'approved', role, role, null],
      );
      return saved;
    });
  }

  async updatePlatformRoleAccess(
    actorId: string,
    targetId: string,
    action: 'suspend' | 'restore' | 'revoke',
    reason?: string,
  ): Promise<User> {
    return this.dataSource.transaction(async manager => {
      await this.assertActiveAdmin(actorId, manager);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['sophis-central-platform-role-access']);
      const target = await manager.findOne(User, { where: { id: targetId }, lock: { mode: 'pessimistic_write' } });
      if (!target) throw new NotFoundException('The platform account was not found.');
      if (![UserRole.SUPPORT, UserRole.MODERATOR].includes(target.role)) {
        throw new ConflictException('Only the dedicated Support or Moderator account can be managed here.');
      }
      if (action !== 'restore' && !reason?.trim()) {
        throw new BadRequestException('A reason is required for suspension or revocation.');
      }
      if (target.hasReviewerAccess === true || target.isGlobalReviewer === true) {
        throw new ConflictException('An account with separate Academic Reviewer authority cannot be managed as a Support or Moderator identity.');
      }

      if (action === 'suspend') {
        if (target.platformRoleStatus === 'suspended') return target;
        if (target.platformRoleStatus !== 'approved' || !target.platformRoleVerifiedAt) {
          throw new ConflictException('Only an Admin-approved platform account can be suspended.');
        }
        target.isSuspended = true;
        target.suspensionReason = reason!.trim();
        target.platformRoleStatus = 'suspended';
      } else if (action === 'restore') {
        if (target.platformRoleStatus !== 'suspended' || !target.platformRoleVerifiedAt) {
          throw new ConflictException('Only a suspended, previously approved platform account can be restored.');
        }
        if (target.accountStatus !== 'active') {
          throw new ConflictException('The account lifecycle must be active before platform access can be restored.');
        }
        target.isSuspended = false;
        target.suspensionReason = null;
        target.platformRoleStatus = 'approved';
      } else {
        if (target.platformRoleStatus === 'revoked') return target;
        target.platformRoleVerifiedAt = null;
        target.platformRoleStatus = 'revoked';
        target.isSuspended = false;
        target.suspensionReason = null;
      }

      const saved = await manager.save(User, target);
      await manager.query(
        'INSERT INTO platform_role_audit_events ("actorId", "targetId", role, action, "previousRole", "newRole", reason, "actorEmail", "targetEmail") SELECT $1::uuid, $2::uuid, $3, $4, $5, $6, $7, actor.email, target.email FROM users actor CROSS JOIN users target WHERE actor.id = $1::uuid AND target.id = $2::uuid',
        [actorId, target.id, target.role, action, target.role, target.role, reason?.trim() || null],
      );
      return saved;
    });
  }

  async findAll(): Promise<User[]> {
    // The platform-owned moderator account is operational infrastructure, not a
    // managed user. Never expose moderator-role accounts through user management.
    return this.usersRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.firstName', 'user.lastName', 'user.academicHandle', 'user.role', 'user.reviewerExpertise', 'user.hasReviewerAccess', 'user.isGlobalReviewer', 'user.reviewerStatus', 'user.authProvider', 'user.isVerified', 'user.emailVerified', 'user.isSuspended', 'user.suspensionReason', 'user.accountStatus', 'user.isProfileComplete', 'user.deletionScheduledAt', 'user.institution', 'user.lastLoginAt', 'user.createdAt', 'user.updatedAt'])
      .where('user.role != :platformModeratorRole', { platformModeratorRole: UserRole.MODERATOR })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async findAllForManagement(): Promise<User[]> {
    return this.usersRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.firstName', 'user.lastName', 'user.academicHandle', 'user.role', 'user.reviewerExpertise', 'user.hasReviewerAccess', 'user.reviewerStatus', 'user.authProvider', 'user.isVerified', 'user.emailVerified', 'user.isSuspended', 'user.suspensionReason', 'user.accountStatus', 'user.deletionScheduledAt', 'user.institution', 'user.lastLoginAt', 'user.createdAt', 'user.updatedAt'])
      .where('user.role NOT IN (:...excludedPlatformRoles)', {
        excludedPlatformRoles: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT],
      })
      .andWhere('user.emailVerified = true')
      .andWhere('(user.role NOT IN (:...profileRoles) OR user.isProfileComplete = true)', {
        profileRoles: [UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER],
      })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }


  async setReviewerAccess(_id: string, _dto: SetReviewerAccessDto): Promise<User> {
    throw new ConflictException('Academic Reviewer access changes must go through the application decision workflow so every approval, suspension and revocation is audited.');
  }
  async update(id: string, data: Partial<User>): Promise<User> {
    return this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException('User not found');
      const updateData = { ...data };
      if ([UserRole.STUDENT, UserRole.LECTURER].includes(user.role) && updateData.institution !== undefined && !user.institutionId && !updateData.institutionId) {
        throw new BadRequestException('Select your institution from the approved catalogue to receive your permanent Institution ID.');
      }
      if (updateData.institutionId !== undefined) {
        if (!updateData.institutionId) throw new BadRequestException('Institution ID cannot be cleared.');
        if (user.institutionId && user.institutionId !== updateData.institutionId) {
          throw new ForbiddenException('Your original Institution ID is permanent. Additional institution memberships must be managed separately.');
        }
        const institution = await manager.findOne(Institution, { where: { id: updateData.institutionId } });        if (!institution) throw new BadRequestException('Select an institution from the approved Sophis Central catalogue.');
        if (!user.institutionId) updateData.uniqueId = await this.generateUniqueId(user, institution);
        updateData.institution = institution.name;      }
      if (updateData.institution !== undefined && user.institutionId && updateData.institutionId !== user.institutionId && updateData.institution.trim().toLocaleLowerCase() !== (user.institution ?? '').trim().toLocaleLowerCase()) {        throw new ForbiddenException('Your original institution is permanent and cannot be changed on this account.');
      }
      if (updateData.isSuspended !== undefined && user.role === UserRole.ADMIN && data.isSuspended === true) {
        throw new ForbiddenException('Administrator accounts cannot be suspended through moderator account management.');
      }
      if (user.role === UserRole.MODERATOR && updateData.isSuspended !== undefined) {
        throw new ForbiddenException('The platform moderator account is protected from user-management status changes.');
      }
      const institutionChanged = updateData.institution !== undefined && updateData.institution.trim().toLocaleLowerCase() !== (user.institution ?? '').trim().toLocaleLowerCase();
      const facultyChanged = updateData.faculty !== undefined && updateData.faculty.trim().toLocaleLowerCase() !== (user.faculty ?? '').trim().toLocaleLowerCase();
      const departmentChanged = updateData.department !== undefined && updateData.department.trim().toLocaleLowerCase() !== (user.department ?? '').trim().toLocaleLowerCase();
      const completingOnboarding = updateData.isProfileComplete === true && user.isProfileComplete !== true;
      if (institutionChanged || facultyChanged || departmentChanged || completingOnboarding) {
        if (updateData.faculty === undefined || updateData.department === undefined) {
          throw new BadRequestException('Enter your academic unit and department together to complete or change academic placement.');
        }
        const institutionName = (updateData.institution ?? user.institution ?? '').trim();
        const facultyName = updateData.faculty.trim();
        const departmentName = updateData.department.trim();
        if (!institutionName || !facultyName || !departmentName) {
          throw new BadRequestException('Your institution, academic unit (faculty/school/college), and complete department name are required.');
        }
        // Institution, academic-unit and department values are profile data.
        // When a directory or the institution list is unavailable, allow manual
        // entry without creating or queueing a shared catalogue submission.
        // The shared catalogue remains unchanged until an administrator imports
        // independently verified source data.
      }
      if (updateData.academicHandle !== undefined) {
        const normalized = updateData.academicHandle.trim().replace(/^@+/, '').toLowerCase();
        const existing = await manager.createQueryBuilder(User, 'user').where('LOWER(user.academicHandle) = :handle', { handle: normalized }).andWhere('user.id != :id', { id }).getOne();
        const reserved = await manager.query(
          'SELECT email FROM registration_drafts WHERE LOWER("academicHandle") = $1 AND email <> $2 LIMIT 1',
          [normalized, user.email.toLowerCase()],
        );
        if (existing || reserved.length) throw new ConflictException('Academic handle taken');
        updateData.academicHandle = normalized;
      }
      if (updateData.isSuspended === true && (user.role === UserRole.REVIEWER || user.hasReviewerAccess === true)) {
        await manager.query(
        'INSERT INTO reviewer_assignment_events ("assignmentId", "resourceId", "reviewerId", "actorId", "eventType") SELECT "reviewAssignmentId", "id", "assignedReviewerId", NULL, $2 FROM resources WHERE "assignedReviewerId" = $1::uuid AND "reviewAssignmentId" IS NOT NULL',
        [user.id, 'released'],
      );
      await manager.query('UPDATE resources SET "assignedReviewerId" = NULL, "reviewAssignmentId" = NULL WHERE "assignedReviewerId" = $1::uuid', [user.id]);
      }
      const previousProfileImage = user.profileImage;
      Object.assign(user, updateData);
      const saved = await manager.save(User, user);
      if (updateData.profileImage !== undefined && previousProfileImage && previousProfileImage !== saved.profileImage) await this.storageCleanup.enqueueWithManager(manager, previousProfileImage, 'replaced-profile-image');
      return saved;
    });
  }

  async updateProfileImage(id: string, profileImage: string): Promise<User> {
    return this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException('User not found');
      const previous = user.profileImage;
      user.profileImage = profileImage;
      const saved = await manager.save(User, user);
      if (previous && previous !== profileImage) {
        await this.storageCleanup.enqueueWithManager(manager, previous, 'replaced-profile-image');
      }
      return saved;
    });
  }

  async remove(id: string, actor: User): Promise<void> {
    await this.assertActiveAdmin(actor.id);
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.MODERATOR) {
      throw new ForbiddenException('The platform moderator account cannot be deleted through user management.');
    }
    if (user.accountStatus === 'pending_deletion') throw new ConflictException('A deletion request is already pending for this account.');
    const requestedAt = new Date();
    user.accountStatus = 'pending_deletion';
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.deletionRequestedAt = requestedAt;
    user.deletionScheduledAt = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await this.usersRepository.save(user);
  }



  async reactivateDeactivatedAccount(id: string) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.accountStatus !== 'deactivated') {
      throw new BadRequestException('Only voluntarily deactivated accounts can be reactivated through this action.');
    }
    if (user.isSuspended) {
      throw new ForbiddenException('This account also has a moderator-imposed suspension that must be resolved separately.');
    }
    user.accountStatus = 'active';
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.usersRepository.save(user);
    return { success: true, accountStatus: user.accountStatus };
  }

  private normalizeSecurityAnswer(answer: string): string {
    return answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  }

  private async getSensitiveAccount(id: string): Promise<User> {
    const user = await this.usersRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.securityAnswerHash')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getSecurityQuestionStatus(id: string) {
    const user = await this.usersRepository.findOne({ where: { id }, select: ['id', 'securityQuestionId'] });
    if (!user) throw new NotFoundException('User not found');
    return { configured: Boolean(user.securityQuestionId), questionId: user.securityQuestionId ?? null };
  }

  async setSecurityQuestion(id: string, password: string, questionId: string, answer: string, currentAnswer?: string) {
    const allowedQuestions = ['first_school', 'childhood_friend', 'first_pet', 'favorite_teacher', 'birth_city'];
    if (!allowedQuestions.includes(questionId)) throw new BadRequestException('Choose one of the available security questions.');
    const normalizedAnswer = this.normalizeSecurityAnswer(answer);
    if (normalizedAnswer.length < 3) throw new BadRequestException('Your answer must contain at least 3 characters.');
    const user = await this.getSensitiveAccount(id);
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }
    if (user.securityAnswerHash && (!currentAnswer || !(await bcrypt.compare(this.normalizeSecurityAnswer(currentAnswer), user.securityAnswerHash)))) {
      throw new UnauthorizedException('Your current security answer is incorrect.');
    }
    user.securityQuestionId = questionId;
    user.securityAnswerHash = await bcrypt.hash(normalizedAnswer, 12);
    await this.usersRepository.save(user);
    return { success: true, configured: true, questionId };
  }

  async deactivateOwnAccount(id: string, password: string) {
    const user = await this.getSensitiveAccount(id);
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(user.role)) {
      throw new ForbiddenException('This account type cannot be deactivated from its own settings.');
    }
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }
    if (user.accountStatus === 'pending_deletion') {
      throw new ConflictException('This account already has a pending deletion request.');
    }
    user.accountStatus = 'deactivated';
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.usersRepository.save(user);
    return { success: true, accountStatus: user.accountStatus };
  }

  async requestOwnAccountDeletion(id: string, password: string, securityAnswer: string) {
    const user = await this.getSensitiveAccount(id);
    if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(user.role)) {
      throw new ForbiddenException('This account type cannot be deleted from its own settings.');
    }
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }
    if (!user.securityQuestionId || !user.securityAnswerHash) {
      throw new BadRequestException('Set up your account security question before requesting deletion.');
    }
    if (!(await bcrypt.compare(this.normalizeSecurityAnswer(securityAnswer), user.securityAnswerHash))) {
      throw new UnauthorizedException('The security answer is incorrect.');    }
    if (user.accountStatus === 'pending_deletion') {
      throw new ConflictException('A deletion request is already pending for this account.');
    }
    const requestedAt = new Date();
    user.accountStatus = 'pending_deletion';
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.deletionRequestedAt = requestedAt;
    user.deletionScheduledAt = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await this.usersRepository.save(user);
    return { success: true, accountStatus: user.accountStatus, deletionRequestedAt: user.deletionRequestedAt, deletionScheduledAt: user.deletionScheduledAt, gracePeriodDays: 30 };
  }

  async cancelPendingDeletion(email: string, password: string, securityAnswer: string) {    const normalizedEmail = email.trim().toLowerCase();    const user = await this.usersRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.securityAnswerHash')      .where('LOWER(user.email) = :email', { email: normalizedEmail })
      .getOne();
    if (!user || user.accountStatus !== 'pending_deletion' || !user.deletionScheduledAt || user.deletionScheduledAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('The account could not be restored with the supplied details.');
    }
    if (!user.password || !(await bcrypt.compare(password, user.password)) || !user.securityAnswerHash ||
      !(await bcrypt.compare(this.normalizeSecurityAnswer(securityAnswer), user.securityAnswerHash))) {
      throw new UnauthorizedException('The account could not be restored with the supplied details.');
    }
    user.accountStatus = 'active';
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.deletionRequestedAt = undefined;
    user.deletionScheduledAt = undefined;
    await this.usersRepository.save(user);
    return { success: true, message: 'Your deletion request has been cancelled. You can now sign in.' };
  }

  async previewDueAccountDeletions(): Promise<{ eligible: number; batchLimit: number; hasMore: boolean }> {
    const eligible = await this.usersRepository.count({
      where: { accountStatus: 'pending_deletion', deletionScheduledAt: LessThanOrEqual(new Date()) },
    });
    const batchLimit = 100;
    return { eligible, batchLimit, hasMore: eligible > batchLimit };
  }

  async purgeDueAccountDeletions(): Promise<{ processed: number }> {
    const dueAccounts = await this.usersRepository.find({
      where: { accountStatus: 'pending_deletion', deletionScheduledAt: LessThanOrEqual(new Date()) },
      select: ['id'],
      take: 100,
      order: { deletionScheduledAt: 'ASC' },
    });
    let processed = 0;
    let failed = 0;
    for (const account of dueAccounts) {
      try {
        await this.removeAccountData(account.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(`Permanent deletion failed for account ${account.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    if (failed > 0) throw new Error(`Account deletion cleanup completed with ${processed} successful and ${failed} failed account(s).`);
    return { processed };
  }

  private async removeAccountData(id: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      // Queue owned objects in the same transaction as the account-data deletion.
      // The worker performs a final global reference check before deleting from R2.
      const profileRows = await manager.query('SELECT "profileImage" FROM users WHERE id = $1::uuid', [id]);
      await this.storageCleanup.enqueueWithManager(manager, profileRows[0]?.profileImage, 'account-deleted-profile-image');

      const resourceFiles = await manager.query(
        'SELECT "fileUrl" FROM resources WHERE "uploaderId"::text = $1::text AND "moderationStatus" <> \'approved\' AND "fileUrl" IS NOT NULL',
        [id],
      );
      for (const row of resourceFiles) {
        await this.storageCleanup.enqueueWithManager(manager, row.fileUrl, 'account-deleted-resource-file');
      }

      const uploadFiles = await manager.query(
        'SELECT "s3Key" FROM file_uploads WHERE "userId"::text = $1::text',
        [id],
      );
      for (const row of uploadFiles) {
        await this.storageCleanup.enqueueWithManager(manager, row.s3Key, 'account-deleted-upload');
      }

      const legacyFiles = await manager.query(
        'SELECT legacy.s3_key FROM resource_files legacy JOIN resources resource ON resource.id = legacy.resource_id WHERE resource."uploaderId"::text = $1::text AND resource."moderationStatus" <> \'approved\'',
        [id],
      );
      for (const row of legacyFiles) {
        await this.storageCleanup.enqueueWithManager(manager, row.s3_key, 'account-deleted-legacy-resource-file');
      }
      await manager.query(
        'DELETE FROM resource_files WHERE resource_id IN (SELECT id FROM resources WHERE "uploaderId"::text = $1::text AND "moderationStatus" <> \'approved\')',
        [id],
      );

      const supportRows = await manager.query(
        'SELECT attachments FROM support_requests WHERE "userId" = $1::uuid',
        [id],
      );
      for (const row of supportRows) {
        const attachments = Array.isArray(row.attachments) ? row.attachments : [];
        for (const attachment of attachments) {
          if (typeof attachment === 'string') {
            await this.storageCleanup.enqueueWithManager(manager, attachment, 'account-deleted-support-attachment');
          }
        }
      }

      // Reverse only the unspent portion of the referral reward tied to this referred student.
      const incomingReferrals = await manager.query(
        'SELECT id, "referrerId", "rewardRemaining" FROM referrals WHERE "referredUserId" = $1::uuid FOR UPDATE',
        [id],
      );
      for (const referral of incomingReferrals) {
        const remaining = Math.max(0, Number(referral.rewardRemaining) || 0);
        if (remaining > 0) {
          const walletRows = await manager.query(
            'WITH current_wallet AS (SELECT id, balance FROM point_wallets WHERE "userId" = $1::uuid FOR UPDATE), updated_wallet AS (UPDATE point_wallets wallet SET balance = wallet.balance - LEAST(current_wallet.balance, $2) FROM current_wallet WHERE wallet.id = current_wallet.id RETURNING LEAST(current_wallet.balance, $2) AS reversed) SELECT reversed FROM updated_wallet',
            [referral.referrerId, remaining],
          );
          const reversed = Math.max(0, Number(walletRows[0]?.reversed) || 0);
          if (reversed > 0) {
            await manager.query(
              'INSERT INTO point_transactions ("userId", type, amount, reason) VALUES ($1::text, $2, $3, $4)',
              [referral.referrerId, 'spent', -reversed, 'Referral reward reversal - referred student account deleted'],
            );
          }
        }
        await manager.query(
          'UPDATE referrals SET "rewardRemaining" = 0, "referredUserId" = NULL WHERE id = $1::uuid',
          [referral.id],
        );
      }

      // Keep approved shared academic contributions while anonymizing their uploader.
      await manager.query('UPDATE resources SET "uploaderId" = NULL WHERE "uploaderId" = $1::uuid AND "moderationStatus" = \'approved\'', [id]);

      // Release reviewer assignments before deleting the user to preserve resource records.
      await manager.query('UPDATE resources SET "assignedReviewerId" = NULL, "reviewAssignmentId" = NULL WHERE "assignedReviewerId" = $1::uuid', [id]);

      // Preserve shared chat content while anonymizing the deleted account's identity.
      await manager.query('UPDATE chat_messages SET "senderId" = NULL, "senderHandle" = \'Deleted user\' WHERE "senderId" = $1::uuid', [id]);
      await manager.query('DELETE FROM user_activity_events WHERE "userId" = $1::text OR "resourceId" IN (SELECT id FROM resources WHERE "uploaderId"::text = $1::text)', [id]);
      await manager.query('DELETE FROM notifications WHERE "userId" = $1::text', [id]);
      await manager.query('DELETE FROM point_transactions WHERE "userId" = $1::text', [id]);
      await manager.query('DELETE FROM point_wallets WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM password_reset_tokens WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM email_verification_tokens WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM file_uploads WHERE "userId"::text = $1::text', [id]);
      await manager.query('DELETE FROM referrals WHERE "referrerId" = $1::uuid', [id]);
      await manager.query('DELETE FROM ai_sessions WHERE "userId" = $1::text', [id]);
      await manager.query('DELETE FROM support_requests WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM resources WHERE "uploaderId" = $1::uuid AND "moderationStatus" <> \'approved\'', [id]);
      await manager.query('DELETE FROM ai_usage_logs WHERE user_id = $1::uuid', [id]);
      await manager.query('DELETE FROM users WHERE id = $1::uuid', [id]);
    });
  }
}