import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Institution } from '../institutions/entities/institution.entity';
import { generateInstitutionCode, institutionTypeCode } from '../institutions/institution-code';
import { StorageCleanupService } from '../upload/storage-cleanup.service';
import { SetReviewerAccessDto } from './dto/set-reviewer-access.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(Institution) private readonly institutionRepository: Repository<Institution>,
    private readonly dataSource: DataSource,
    private readonly storageCleanup: StorageCleanupService,
  ) {}

  private async generateUniqueId(data: Partial<User>, institution?: Institution | null): Promise<string> {
    const accountRole = data.role ?? UserRole.STUDENT;
    const baseRole = accountRole === UserRole.REVIEWER ? data.reviewerBaseRole : accountRole;
    const roleCode = baseRole === UserRole.LECTURER ? 'LEC'
      : baseRole === UserRole.STUDENT ? 'STU'
      : accountRole === UserRole.ADMIN ? 'ADM' : 'SYS';
    if ([UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(accountRole) && !institution) {
      throw new BadRequestException('Choose an institution from the Sophis Central catalogue before creating your account.');
    }
    const institutionPart = institution
      ? `${institutionTypeCode(institution.institutionType)}-${institution.institutionCode || generateInstitutionCode(institution.name, institution.institutionType, institution.id)}`
      : 'PLT';
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = Array.from(randomBytes(10), (byte) => alphabet[byte & 31]).join('');
      const candidate = `SC-${institutionPart}-${roleCode}-${suffix}`;
      if (!await this.usersRepository.exist({ where: { uniqueId: candidate } })) return candidate;
    }
    throw new ConflictException('A unique Sophis Central Institution ID could not be generated. Please retry registration.');
  }

  async create(data: Partial<User>): Promise<User> {
    const institution = data.institutionId
      ? await this.institutionRepository.findOne({ where: { id: data.institutionId } })
      : null;
    if (data.institutionId && !institution) throw new BadRequestException('The selected institution is not in the approved Sophis Central catalogue.');
    const uniqueId = await this.generateUniqueId(data, institution);
    return this.usersRepository.save(this.usersRepository.create({
      ...data,
      ...(institution ? { institution: institution.name } : {}),
      uniqueId,
    }));
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
      .andWhere("user.accountStatus = 'active'")
      .andWhere('user.academicHandle IS NOT NULL');
    const normalizedSearch = search?.trim().replace(/^@+/, '').toLowerCase();
    if (normalizedSearch) query.andWhere('LOWER(user.academicHandle) LIKE :search', { search: `%${normalizedSearch}%` });
    return query.orderBy('user.academicHandle', 'ASC').take(50).getMany();
  }

  async findAll(): Promise<User[]> {
    // The platform-owned moderator account is operational infrastructure, not a
    // managed user. Never expose moderator-role accounts through user management.
    return this.usersRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.firstName', 'user.lastName', 'user.academicHandle', 'user.role', 'user.reviewerExpertise', 'user.authProvider', 'user.isVerified', 'user.isSuspended', 'user.suspensionReason', 'user.accountStatus', 'user.deletionScheduledAt', 'user.institution', 'user.createdAt', 'user.updatedAt'])
      .where('user.role != :platformModeratorRole', { platformModeratorRole: UserRole.MODERATOR })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }


  async setReviewerAccess(id: string, dto: SetReviewerAccessDto): Promise<User> {
    return this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException('User not found');

      if (dto.enabled) {
        if (![UserRole.STUDENT, UserRole.LECTURER, UserRole.REVIEWER].includes(user.role)) {
          throw new BadRequestException('Only student or lecturer accounts can be granted academic reviewer access');
        }
        const expertiseAreas = [...new Set((dto.expertiseAreas ?? []).map(area => area.trim()).filter(Boolean))];
        if (expertiseAreas.length === 0) {
          throw new BadRequestException('At least one verified subject expertise area is required');
        }
        if (user.role !== UserRole.REVIEWER) user.reviewerBaseRole = user.role as 'student' | 'lecturer';
        user.role = UserRole.REVIEWER;
        user.reviewerExpertise = expertiseAreas;
      } else {
        if (user.role !== UserRole.REVIEWER) {
          throw new BadRequestException('This account does not currently have reviewer access');
        }
        user.role = (user.reviewerBaseRole as UserRole | undefined) ?? UserRole.STUDENT;
        await manager.query('UPDATE resources SET "assignedReviewerId" = NULL WHERE "assignedReviewerId" = $1::uuid', [user.id]);
        user.reviewerBaseRole = undefined;
        user.reviewerExpertise = [];
      }

      return manager.save(User, user);
    });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException('User not found');
      const updateData = { ...data };
      if (updateData.institutionId !== undefined) {
        if (!updateData.institutionId) throw new BadRequestException('Institution ID cannot be cleared.');
        if (user.institutionId && user.institutionId !== updateData.institutionId) {
          throw new ForbiddenException('Your original Institution ID is permanent. Additional institution memberships must be managed separately.');
        }
        const institution = await manager.findOne(Institution, { where: { id: updateData.institutionId } });
        if (!institution) throw new BadRequestException('Select an institution from the approved Sophis Central catalogue.');
        if (!user.institutionId) updateData.uniqueId = await this.generateUniqueId(user, institution);
        updateData.institution = institution.name;
      }
      if (updateData.institution !== undefined && user.institutionId && updateData.institutionId !== user.institutionId && updateData.institution.trim().toLocaleLowerCase() !== (user.institution ?? '').trim().toLocaleLowerCase()) {
        throw new ForbiddenException('Your original institution is permanent and cannot be changed on this account.');
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
        if (existing) throw new ConflictException('Academic handle already exists');
        updateData.academicHandle = normalized;
      }
      if (updateData.isSuspended === true && user.role === UserRole.REVIEWER) {
        await manager.query('UPDATE resources SET "assignedReviewerId" = NULL WHERE "assignedReviewerId" = $1::uuid', [user.id]);
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

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.MODERATOR) {
      throw new ForbiddenException('The platform moderator account cannot be deleted through user management.');
    }
    if (user.accountStatus === 'pending_deletion') throw new ConflictException('A deletion request is already pending for this account.');
    const requestedAt = new Date();
    user.accountStatus = 'pending_deletion';
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
      throw new UnauthorizedException('The security answer is incorrect.');
    }
    if (user.accountStatus === 'pending_deletion') {
      throw new ConflictException('A deletion request is already pending for this account.');
    }
    const requestedAt = new Date();
    user.accountStatus = 'pending_deletion';
    user.deletionRequestedAt = requestedAt;
    user.deletionScheduledAt = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await this.usersRepository.save(user);
    return { success: true, accountStatus: user.accountStatus, deletionRequestedAt: user.deletionRequestedAt, deletionScheduledAt: user.deletionScheduledAt, gracePeriodDays: 30 };
  }

  async cancelPendingDeletion(email: string, password: string, securityAnswer: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.securityAnswerHash')
      .where('LOWER(user.email) = :email', { email: normalizedEmail })
      .getOne();
    if (!user || user.accountStatus !== 'pending_deletion' || !user.deletionScheduledAt || user.deletionScheduledAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('The account could not be restored with the supplied details.');
    }
    if (!user.password || !(await bcrypt.compare(password, user.password)) || !user.securityAnswerHash ||
      !(await bcrypt.compare(this.normalizeSecurityAnswer(securityAnswer), user.securityAnswerHash))) {
      throw new UnauthorizedException('The account could not be restored with the supplied details.');
    }
    user.accountStatus = 'active';
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
      await manager.query('UPDATE resources SET "assignedReviewerId" = NULL WHERE "assignedReviewerId" = $1::uuid', [id]);

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