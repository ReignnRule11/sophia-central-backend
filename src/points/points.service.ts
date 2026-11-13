import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceRewardOutbox, ResourceRewardStatus } from './entities/resource-reward-outbox.entity';
import { PointWallet } from './entities/point-wallet.entity';
import { PointTransaction, PointTransactionType } from './entities/point-transaction.entity';
import { AwardPointsDto } from './dto/award-points.dto';
import { Referral } from '../referral/entities/referral.entity';
import { User, UserRole } from '../users/entities/user.entity';

const STARTER_WISDOM_POINTS = 10;
const STARTER_CREDIT_REASON = 'Sophis AI starter credits';

@Injectable()
export class PointsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PointsService.name);
  private rewardWorkerTimer: NodeJS.Timeout | null = null;
  private rewardWorkerRunning = false;
  constructor(
    @InjectRepository(PointWallet) private readonly walletRepository: Repository<PointWallet>,
    @InjectRepository(PointTransaction) private readonly transactionRepository: Repository<PointTransaction>,
    @InjectRepository(ResourceRewardOutbox) private readonly rewardOutboxRepository: Repository<ResourceRewardOutbox>,
    @InjectRepository(Referral) private readonly referralRepository: Repository<Referral>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  onModuleInit(): void {
    void this.processPendingResourceRewards();
    this.rewardWorkerTimer = setInterval(() => void this.processPendingResourceRewards(), 30_000);
    this.rewardWorkerTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.rewardWorkerTimer) clearInterval(this.rewardWorkerTimer);
  }

  private async processOutboxEntry(outboxId: string): Promise<void> {
    try {
      await this.rewardOutboxRepository.manager.transaction(async manager => {
        const job = await manager.findOne(ResourceRewardOutbox, {
          where: { id: outboxId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!job || job.status !== ResourceRewardStatus.PENDING) return;

        const user = await manager.findOne(User, { where: { id: job.userId } });
        if (!user || user.role !== UserRole.STUDENT || user.isSuspended) {
          job.status = ResourceRewardStatus.COMPLETED;
          job.completedAt = new Date();
          job.lastError = 'Account is no longer eligible for a contribution reward.';
          await manager.save(ResourceRewardOutbox, job);
          return;
        }

        // Preserve the existing student starter-credit behavior for accounts
        // whose wallet has not yet been initialized.
        await this.getOrCreateWallet(job.userId);

        const wallet = await manager.findOne(PointWallet, {
          where: { userId: job.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!wallet) {
          throw new BadRequestException('Wisdom Points wallet is not initialized yet.');
        }

        const reason = `Approved resource contribution reward: ${job.resourceId}`;
        const existing = await manager.findOne(PointTransaction, { where: { userId: job.userId, reason } });
        if (!existing) {
          wallet.balance += 10;
          await manager.save(PointWallet, wallet);
          await manager.save(PointTransaction, manager.create(PointTransaction, {
            userId: job.userId,
            type: PointTransactionType.EARNED,
            amount: 10,
            reason,
          }));
        }

        job.status = ResourceRewardStatus.COMPLETED;
        job.completedAt = new Date();
        job.lastError = null;
        await manager.save(ResourceRewardOutbox, job);
      });
    } catch (error) {
      const job = await this.rewardOutboxRepository.findOne({ where: { id: outboxId } });
      if (!job || job.status !== ResourceRewardStatus.PENDING) return;
      const attempts = job.attempts + 1;
      const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.min(attempts - 1, 10)));
      job.attempts = attempts;
      job.nextAttemptAt = new Date(Date.now() + delayMs);
      job.lastError = String(error).slice(0, 2000);
      await this.rewardOutboxRepository.save(job);
      this.logger.error(`Wisdom Points reward for resource ${job.resourceId} failed; retry ${attempts} scheduled.`, String(error));
    }
  }

  async processPendingResourceRewards(): Promise<void> {
    if (this.rewardWorkerRunning) return;
    this.rewardWorkerRunning = true;
    try {
      const dueJobs = await this.rewardOutboxRepository.createQueryBuilder('job')
        .where('job.status = :status', { status: ResourceRewardStatus.PENDING })
        .andWhere('job."nextAttemptAt" <= :now', { now: new Date() })
        .orderBy('job."createdAt"', 'ASC')
        .take(25)
        .getMany();
      for (const job of dueJobs) await this.processOutboxEntry(job.id);
    } catch (error) {
      this.logger.error('Could not scan pending Wisdom Points rewards.', String(error));
    } finally {
      this.rewardWorkerRunning = false;
    }
  }

  async processResourceApprovalReward(resourceId: string): Promise<boolean> {
    const job = await this.rewardOutboxRepository.findOne({ where: { resourceId } });
    if (job?.status === ResourceRewardStatus.PENDING) await this.processOutboxEntry(job.id);
    return !!(await this.transactionRepository.findOne({
      where: { reason: `Approved resource contribution reward: ${resourceId}` },
    }));
  }

  private async assertStudent(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Wisdom Points wallets are available only to student accounts.');
    }
  }

  async getOrCreateWallet(userId: string): Promise<PointWallet> {
    await this.assertStudent(userId);
    let wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      wallet = this.walletRepository.create({ userId, balance: 0 });
      wallet = await this.walletRepository.save(wallet);
    }
    const starterGrant = await this.transactionRepository.createQueryBuilder('transaction')
      .where('transaction."userId" = :userId', { userId })
      .andWhere('transaction.reason IN (:...reasons)', { reasons: [STARTER_CREDIT_REASON, 'Sophia AI starter credits'] })
      .getOne();
    if (!starterGrant) {
      wallet.balance += STARTER_WISDOM_POINTS;
      wallet = await this.walletRepository.save(wallet);
      await this.transactionRepository.save(this.transactionRepository.create({
        userId, type: PointTransactionType.BONUS, amount: STARTER_WISDOM_POINTS, reason: STARTER_CREDIT_REASON,
      }));
    }
    return wallet;
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async getTransactions(userId: string, limit = 20) {
    await this.assertStudent(userId);
    const transactions = await this.transactionRepository.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
    return transactions.map(transaction => ({
      ...transaction,
      reason: transaction.reason === STARTER_CREDIT_REASON ? 'Sophis AI starter credits' : transaction.reason,
    }));
  }

  private async consumeReferralRewards(userId: string, spend: number): Promise<void> {
    let remainingSpend = spend;
    const rewards = await this.referralRepository.find({
      where: { referrerId: userId },
      order: { redeemedAt: 'ASC', createdAt: 'ASC' },
    });
    for (const referral of rewards) {
      if (remainingSpend <= 0) break;
      const available = Math.max(0, referral.rewardRemaining || 0);
      const consumed = Math.min(available, remainingSpend);
      if (consumed > 0) {
        referral.rewardRemaining = available - consumed;
        remainingSpend -= consumed;
        await this.referralRepository.save(referral);
      }
    }
  }

  async adjustPoints(userId: string, amount: number, reason: string, moderatorId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    if (wallet.balance + amount < 0) throw new BadRequestException('Adjustment would make the wallet balance negative.');
    if (amount < 0) await this.consumeReferralRewards(userId, Math.abs(amount));
    wallet.balance += amount;
    await this.walletRepository.save(wallet);
    return this.transactionRepository.save(this.transactionRepository.create({
      userId, type: amount < 0 ? PointTransactionType.SPENT : PointTransactionType.EARNED,
      amount, reason: `Moderator adjustment by ${moderatorId}: ${reason}`,
    }));
  }

  async awardPoints(dto: AwardPointsDto) {
    const wallet = await this.getOrCreateWallet(dto.userId);
    if (wallet.balance + dto.amount < 0) throw new BadRequestException('Insufficient Wisdom Points balance.');
    if (dto.amount < 0) await this.consumeReferralRewards(dto.userId, Math.abs(dto.amount));
    wallet.balance += dto.amount;
    await this.walletRepository.save(wallet);
    return this.transactionRepository.save(this.transactionRepository.create({
      userId: dto.userId,
      type: dto.amount < 0 ? PointTransactionType.SPENT : PointTransactionType.EARNED,
      amount: dto.amount,
      reason: dto.reason,
    }));
  }


  async awardReferralReward(referrerId: string, referralId: string, amount: number): Promise<void> {
    // Reject ineligible owners before wallet initialization can grant starter points.
    const currentReferrer = await this.userRepository.findOne({ where: { id: referrerId } });
    if (!currentReferrer || currentReferrer.role !== UserRole.STUDENT || currentReferrer.isSuspended) return;

    // Ensure the wallet exists before entering the reward transaction. The
    // referral row lock makes the credit idempotent under concurrent triggers.
    await this.getOrCreateWallet(referrerId);
    await this.referralRepository.manager.transaction(async manager => {
      const referral = await manager.findOne(Referral, {
        where: { id: referralId, referrerId, isCodeOwnerRecord: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!referral || referral.rewardStatus !== 'pending') return;

      const referrer = await manager.findOne(User, { where: { id: referrerId } });
      if (!referrer || referrer.role !== UserRole.STUDENT || referrer.isSuspended) return;

      const wallet = await manager.findOne(PointWallet, {
        where: { userId: referrerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new BadRequestException('Referral wallet could not be initialized.');

      wallet.balance += amount;
      await manager.save(PointWallet, wallet);
      await manager.save(PointTransaction, manager.create(PointTransaction, {
        userId: referrerId,
        type: PointTransactionType.BONUS,
        amount,
        reason: `Student referral bonus - referral ${referralId}`,
      }));

      referral.rewardRemaining = amount;
      referral.rewardStatus = 'awarded';
      referral.rewardAwardedAt = new Date();
      referral.reviewReason = null;
      await manager.save(Referral, referral);
    });
  }

  async reverseUnspentReferralReward(referral: Referral): Promise<number> {
    const amount = Math.max(0, Math.min(referral.rewardRemaining || 0, 20));
    if (!amount) return 0;
    const wallet = await this.walletRepository.findOne({ where: { userId: referral.referrerId } });
    if (!wallet) return 0;
    const reversal = Math.min(amount, Math.max(0, wallet.balance));
    if (!reversal) return 0;
    wallet.balance -= reversal;
    await this.walletRepository.save(wallet);
    await this.transactionRepository.save(this.transactionRepository.create({
      userId: referral.referrerId, type: PointTransactionType.SPENT, amount: -reversal,
      reason: 'Referral reward reversal - referred student account deleted',
    }));
    referral.rewardRemaining = 0;
    await this.referralRepository.save(referral);
    return reversal;
  }
}
