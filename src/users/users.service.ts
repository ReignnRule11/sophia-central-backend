import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { StorageCleanupService } from '../upload/storage-cleanup.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly storageCleanup: StorageCleanupService,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    return this.usersRepository.save(this.usersRepository.create(data));
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
    const query = this.usersRepository.createQueryBuilder('user')
      .select(['user.id', 'user.academicHandle', 'user.role', 'user.institution', 'user.faculty', 'user.department'])
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere('user.role IN (:...roles)', { roles: [UserRole.STUDENT, UserRole.LECTURER] })
      .andWhere('user.isSuspended = false')
      .andWhere('user.academicHandle IS NOT NULL');
    const normalizedSearch = search?.trim().replace(/^@+/, '').toLowerCase();
    if (normalizedSearch) query.andWhere('LOWER(user.academicHandle) LIKE :search', { search: `%${normalizedSearch}%` });
    return query.orderBy('user.academicHandle', 'ASC').take(50).getMany();
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'authProvider', 'isVerified', 'isSuspended', 'suspensionReason', 'institution', 'createdAt', 'updatedAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('User not found');
    if (data.academicHandle !== undefined) {
      const normalized = data.academicHandle.trim().replace(/^@+/, '').toLowerCase();
      const existing = await this.usersRepository.createQueryBuilder('user')
        .where('LOWER(user.academicHandle) = :handle', { handle: normalized })
        .andWhere('user.id != :id', { id })
        .getOne();
      if (existing) throw new ConflictException('Academic handle already exists');
      data.academicHandle = normalized;
    }
    Object.assign(user, data);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    if (!await this.findOne(id)) throw new NotFoundException('User not found');
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