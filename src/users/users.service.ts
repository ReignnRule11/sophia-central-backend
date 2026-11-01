import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
  }

  async findByAcademicHandle(handle: string): Promise<User | null> {
    const normalized = handle.trim().replace(/^@/, '').toLowerCase();
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.academicHandle) = :handle', { handle: normalized })
      .getOne();
  }

  async findOne(id: string): Promise<User | null> {
    if (!id) return null;
    return this.usersRepository.findOne({ where: { id } });
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
    Object.assign(user, data);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('User not found');
    await this.removeAccountData(id);
  }

  async removeOwnAccount(id: string): Promise<void> {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('User not found');
    await this.removeAccountData(id);
  }

  private async removeAccountData(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Delete account-owned activity and data before removing the user row.
      // Uploaded resources are removed too; their moderation reviews cascade from the resource.
      await manager.query('DELETE FROM user_activity_events WHERE "userId" = $1 OR "resourceId" IN (SELECT id FROM resources WHERE "uploaderId" = $1)', [id]);
      await manager.query('DELETE FROM notifications WHERE "userId" = $1', [id]);
      await manager.query('DELETE FROM point_transactions WHERE "userId" = $1', [id]);
      await manager.query('DELETE FROM point_wallets WHERE "userId" = $1', [id]);
      await manager.query('DELETE FROM password_reset_tokens WHERE "userId" = $1', [id]);
      await manager.query('DELETE FROM referrals WHERE "referrerId" = $1', [id]);
      await manager.query('DELETE FROM ai_sessions WHERE "userId" = $1', [id]);
      await manager.query('DELETE FROM support_requests WHERE "userId" = $1', [id]);
      await manager.query('DELETE FROM resources WHERE "uploaderId" = $1', [id]);
      await manager.query('DELETE FROM users WHERE id = $1', [id]);
    });
  }
}
