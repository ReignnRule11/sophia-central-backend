import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { StorageCleanupService } from '../upload/storage-cleanup.service';
import { SetReviewerAccessDto } from './dto/set-reviewer-access.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly storageCleanup: StorageCleanupService,
  ) {}

  private async generateUniqueId(data: Partial<User>): Promise<string> {
    const institutionWords = (data.institution || 'Sophis Central')
      .normalize('NFKD')
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z]/gi, '').toUpperCase())
      .filter((word) => word && !['OF', 'THE', 'AND', 'FOR', 'AT'].includes(word));
    const institutionCode = institutionWords.length > 1
      ? `${institutionWords[0][0]}${institutionWords[institutionWords.length - 1][0]}`
      : (institutionWords[0] || 'SC').slice(0, 2).padEnd(2, 'S');
    const firstInitial = (data.firstName?.trim().charAt(0) || 'S').toUpperCase();
    const lastInitial = (data.lastName?.trim().charAt(0) || 'C').toUpperCase();
    const initials = `${firstInitial}${lastInitial}`;

    // The database unique index is the final concurrency guard. Retry avoids
    // ordinary random collisions before the insert reaches that constraint.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const sequence = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const candidate = `${institutionCode}-${initials}-${sequence}`;
      if (!await this.usersRepository.exist({ where: { uniqueId: candidate } })) return candidate;
    }
    throw new ConflictException('A unique Sophis Central ID could not be generated. Please retry registration.');
  }

  async create(data: Partial<User>): Promise<User> {
    const uniqueId = await this.generateUniqueId(data);
    return this.usersRepository.save(this.usersRepository.create({ ...data, uniqueId }));
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.createQueryBuilder('user').addSelect('user.password')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() }).getOne();
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
    await this.removeAccountData(id);
  }

  async removeOwnAccount(id: string): Promise<void> {
    if (!await this.findOne(id)) throw new NotFoundException('User not found');
    await this.removeAccountData(id);
  }

  private async removeAccountData(id: string): Promise<void> {
    await this.dataSource.transaction(async manager => {
      // Queue owned objects in the same transaction as the account-data deletion.
      // The worker performs a final global reference check before deleting from R2.
      const profileRows = await manager.query('SELECT "profileImage" FROM users WHERE id = $1::uuid', [id]);
      await this.storageCleanup.enqueueWithManager(manager, profileRows[0]?.profileImage, 'account-deleted-profile-image');

      const resourceFiles = await manager.query(
        'SELECT "fileUrl" FROM resources WHERE "uploaderId"::text = $1::text AND "fileUrl" IS NOT NULL',
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
        'SELECT legacy.s3_key FROM resource_files legacy JOIN resources resource ON resource.id = legacy.resource_id WHERE resource."uploaderId"::text = $1::text',
        [id],
      );
      for (const row of legacyFiles) {
        await this.storageCleanup.enqueueWithManager(manager, row.s3_key, 'account-deleted-legacy-resource-file');
      }
      await manager.query(
        'DELETE FROM resource_files WHERE resource_id IN (SELECT id FROM resources WHERE "uploaderId"::text = $1::text)',
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

      // Preserve shared chat content while anonymizing the deleted account's identity.
      await manager.query('UPDATE chat_messages SET "senderId" = NULL, "senderHandle" = \'Deleted user\' WHERE "senderId" = $1::uuid', [id]);
      await manager.query('DELETE FROM user_activity_events WHERE "userId" = $1::text OR "resourceId" IN (SELECT id FROM resources WHERE "uploaderId"::text = $1::text)', [id]);
      await manager.query('DELETE FROM notifications WHERE "userId" = $1::text', [id]);
      await manager.query('DELETE FROM point_transactions WHERE "userId" = $1::text', [id]);
      await manager.query('DELETE FROM point_wallets WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM password_reset_tokens WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM referrals WHERE "referrerId" = $1::uuid', [id]);
      await manager.query('DELETE FROM ai_sessions WHERE "userId" = $1::text', [id]);
      await manager.query('DELETE FROM support_requests WHERE "userId" = $1::uuid', [id]);
      await manager.query('DELETE FROM resources WHERE "uploaderId" = $1::uuid', [id]);
      await manager.query('DELETE FROM ai_usage_logs WHERE user_id = $1::uuid', [id]);
      await manager.query('DELETE FROM users WHERE id = $1::uuid', [id]);
    });
  }
}