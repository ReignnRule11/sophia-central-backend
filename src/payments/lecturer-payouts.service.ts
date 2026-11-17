import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { PaymentLedgerEntry, PaymentLedgerKind } from './entities/payment-ledger-entry.entity';
import { PaymentLedgerAdjustment, PaymentLedgerAdjustmentKind } from './entities/payment-ledger-adjustment.entity';
import { PaymentDispute, PaymentDisputeStatus } from './entities/payment-dispute.entity';
import { PaymentTransaction, PaymentStatus } from './entities/payment-transaction.entity';
import { PaymentRefund, PaymentRefundStatus } from './entities/payment-refund.entity';
import { PaymentPayoutBeneficiary } from './entities/payment-payout-beneficiary.entity';
import { PaymentPayout, PaymentPayoutStatus } from './entities/payment-payout.entity';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';
import { randomBytes } from 'node:crypto';

const HELD_STATUSES = [PaymentPayoutStatus.REQUESTED, PaymentPayoutStatus.PROCESSING, PaymentPayoutStatus.PENDING, PaymentPayoutStatus.OTP];

@Injectable()
export class LecturerPayoutsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PaymentLedgerEntry) private readonly ledger: Repository<PaymentLedgerEntry>,
    @InjectRepository(PaymentLedgerAdjustment) private readonly adjustments: Repository<PaymentLedgerAdjustment>,
    @InjectRepository(PaymentDispute) private readonly disputes: Repository<PaymentDispute>,
    @InjectRepository(PaymentTransaction) private readonly payments: Repository<PaymentTransaction>,
    @InjectRepository(PaymentPayoutBeneficiary) private readonly beneficiaries: Repository<PaymentPayoutBeneficiary>,
    @InjectRepository(PaymentPayout) private readonly payouts: Repository<PaymentPayout>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  private lecturer(user: User) {
    if (user.role !== UserRole.LECTURER || user.isSuspended || user.accountStatus !== 'active') {
      throw new ForbiddenException('Only active lecturer accounts can manage payout details or request payouts.');
    }
  }

  async setBeneficiary(user: User, input: { accountNumber: string; bankCode: string }) {
    this.lecturer(user);
    if (!/^\d{10}$/.test(input.accountNumber || '') || !/^[A-Za-z0-9_-]{2,16}$/.test(input.bankCode || '')) {
      throw new BadRequestException('Provide a valid 10-digit Nigerian account number and bank code.');
    }
    const existing = await this.beneficiaries.findOne({ where: { lecturerUserId: user.id } });
    if (existing) {
      const activePayout = await this.payouts.findOne({ where: { lecturerUserId: user.id, status: PaymentPayoutStatus.REQUESTED } });
      const inFlight = await this.payouts.createQueryBuilder('payout')
        .where('payout.lecturerUserId = :userId', { userId: user.id })
        .andWhere('payout.status IN (:...statuses)', { statuses: [PaymentPayoutStatus.PROCESSING, PaymentPayoutStatus.PENDING, PaymentPayoutStatus.OTP] })
        .getOne();
      if (activePayout || inFlight) throw new ConflictException('Bank details cannot be changed while a payout is awaiting approval or settlement.');
    }
    const resolved = await this.provider.resolveBankAccount(input.accountNumber, input.bankCode);
    const recipient = await this.provider.createTransferRecipient({
      name: resolved.accountName, accountNumber: resolved.accountNumber, bankCode: resolved.bankCode,
    });
    const beneficiary = existing
      ? await this.beneficiaries.save(Object.assign(existing, {
          provider: this.provider.name, recipientCode: recipient.recipientCode, accountName: recipient.accountName,
          bankName: resolved.bankName, accountLast4: resolved.accountNumber.slice(-4), currency: 'NGN',
        }))
      : await this.beneficiaries.save(this.beneficiaries.create({
          lecturerUserId: user.id, provider: this.provider.name, recipientCode: recipient.recipientCode,
          accountName: recipient.accountName, bankName: resolved.bankName,
          accountLast4: resolved.accountNumber.slice(-4), currency: 'NGN',
        }));
    return { id: beneficiary.id, accountName: beneficiary.accountName, bankName: beneficiary.bankName,
      accountLast4: beneficiary.accountLast4, currency: beneficiary.currency, verified: true };
  }

  private async availableBalance(manager: any, lecturerUserId: string, excludePayoutId?: string): Promise<bigint> {
    const entries: PaymentLedgerEntry[] = await manager.createQueryBuilder(PaymentLedgerEntry, 'entry')
      .innerJoin(PaymentTransaction, 'payment', 'payment.id = entry.paymentId')
      .where('entry.beneficiaryUserId = :lecturerUserId', { lecturerUserId })
      .andWhere('entry.kind = :kind', { kind: PaymentLedgerKind.LECTURER_SHARE })
      .andWhere('payment.status = :success', { success: PaymentStatus.SUCCESS })
      .getMany();
    let balance = 0n;
    for (const entry of entries) {
      const adjustment = await manager.createQueryBuilder(PaymentLedgerAdjustment, 'adjustment')
        .select('COALESCE(SUM(CAST(adjustment."amountMinor" AS BIGINT)), 0)', 'total')
        .where('adjustment.paymentId = :paymentId AND adjustment.kind = :kind', {
          paymentId: entry.paymentId, kind: PaymentLedgerAdjustmentKind.LECTURER_REFUND,
        }).getRawOne();
      let earned = BigInt(entry.amountMinor) - BigInt(adjustment?.total || 0);
      const payment = await manager.findOne(PaymentTransaction, { where: { id: entry.paymentId } });
      if (payment) {
        const reservedRefunds = await manager.createQueryBuilder(PaymentRefund, 'refund')
          .select('COALESCE(SUM(CAST(refund."amountMinor" AS BIGINT)), 0)', 'total')
          .where('refund.paymentId = :paymentId', { paymentId: entry.paymentId })
          .andWhere('refund.status IN (:...statuses)', { statuses: [PaymentRefundStatus.PENDING, PaymentRefundStatus.PROCESSING, PaymentRefundStatus.NEEDS_ATTENTION] })
          .getRawOne();
        const refundHold = (BigInt(reservedRefunds?.total || 0) * BigInt(entry.amountMinor)) / BigInt(payment.amountMinor);
        earned -= refundHold;
      }
      if (earned < 0n) earned = 0n;
      const activeDispute = await manager.createQueryBuilder(PaymentDispute, 'dispute')
        .where('dispute.paymentId = :paymentId', { paymentId: entry.paymentId })
        .andWhere('dispute.status IN (:...statuses)', { statuses: [PaymentDisputeStatus.OPEN, PaymentDisputeStatus.UNDER_REVIEW] })
        .getCount();
      if (activeDispute) earned = 0n; // conservative: hold the full lecturer share while any dispute is open
      balance += earned;
    }
    const reserved = await manager.createQueryBuilder(PaymentPayout, 'payout')
      .select('COALESCE(SUM(CAST(payout."amountMinor" AS BIGINT)), 0)', 'total')
      .where('payout."lecturerUserId" = :lecturerUserId', { lecturerUserId })
      .andWhere('payout.status IN (:...statuses)', { statuses: [...HELD_STATUSES, PaymentPayoutStatus.SUCCESS] })
      .andWhere(excludePayoutId ? 'payout.id <> :excludePayoutId' : '1=1', excludePayoutId ? { excludePayoutId } : {})
      .getRawOne();
    balance -= BigInt(reserved?.total || 0);
    return balance > 0n ? balance : 0n;
  }

  async balance(user: User) {
    this.lecturer(user);
    return this.dataSource.transaction(async manager => {
      const available = await this.availableBalance(manager, user.id);
      const beneficiary = await manager.findOne(PaymentPayoutBeneficiary, { where: { lecturerUserId: user.id } });
      return { availableMinor: available.toString(), currency: 'NGN', beneficiary: beneficiary ? {
        accountName: beneficiary.accountName, bankName: beneficiary.bankName, accountLast4: beneficiary.accountLast4,
      } : null, note: 'Open disputes place the entire affected lecturer allocation on hold. Requested and in-flight payouts are reserved.' };
    });
  }

  async request(user: User, amountMinor: string) {
    this.lecturer(user);
    if (!/^\d+$/.test(amountMinor || '') || BigInt(amountMinor) <= 0n) throw new BadRequestException('amountMinor must be a positive integer in kobo.');
    return this.dataSource.transaction(async manager => {
      await manager.findOne(User, { where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
      const beneficiary = await manager.findOne(PaymentPayoutBeneficiary, { where: { lecturerUserId: user.id } });
      if (!beneficiary) throw new ConflictException('Verify and save a bank beneficiary before requesting a payout.');
      const available = await this.availableBalance(manager, user.id);
      if (BigInt(amountMinor) > available) throw new ConflictException('Payout amount exceeds the available lecturer balance.');
      const payout = manager.create(PaymentPayout, {
        lecturerUserId: user.id, beneficiaryId: beneficiary.id, reference: `sophis-payout-${randomBytes(16).toString('hex')}`,
        provider: this.provider.name, amountMinor, currency: 'NGN', status: PaymentPayoutStatus.REQUESTED,
        approvedByUserId: null, providerTransferCode: null, providerMetadata: null, failureReason: null, completedAt: null,
      });
      const saved = await manager.save(PaymentPayout, payout);
      return this.publicPayout(saved);
    });
  }

  async approve(admin: User, payoutId: string) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(admin.role)) throw new ForbiddenException('Only administrators or moderators may approve lecturer payouts.');
    const payout = await this.dataSource.transaction(async manager => {
      const record = await manager.findOne(PaymentPayout, { where: { id: payoutId }, lock: { mode: 'pessimistic_write' } });
      if (!record) throw new NotFoundException('Payout request not found.');
      if (record.status !== PaymentPayoutStatus.REQUESTED) throw new ConflictException('Only a newly requested payout can be approved.');
      if (record.lecturerUserId === admin.id) throw new ForbiddenException('A lecturer cannot approve their own payout.');
      const beneficiary = await manager.findOneBy(PaymentPayoutBeneficiary, { id: record.beneficiaryId });
      if (!beneficiary || beneficiary.provider !== this.provider.name) throw new ConflictException('Payout beneficiary is unavailable or belongs to another provider.');
      await manager.findOne(User, { where: { id: record.lecturerUserId }, lock: { mode: 'pessimistic_write' } });
      const available = await this.availableBalance(manager, record.lecturerUserId, record.id);
      if (BigInt(record.amountMinor) > available) throw new ConflictException('Available balance changed; this payout can no longer be approved.');
      record.status = PaymentPayoutStatus.PROCESSING;
      record.approvedByUserId = admin.id;
      await manager.save(PaymentPayout, record);
      return { record, beneficiary };
    });
    try {
      const transfer = await this.provider.initiateTransfer({
        amountMinor: payout.record.amountMinor, recipientCode: payout.beneficiary.recipientCode,
        reference: payout.record.reference, reason: 'Sophis Central lecturer earnings payout',
      });
      const status = this.mapStatus(transfer.status);
      await this.payouts.update({ id: payout.record.id }, {
        status, providerTransferCode: transfer.transferCode, providerMetadata: { status: transfer.status },
        completedAt: status === PaymentPayoutStatus.SUCCESS ? new Date() : null,
      });
    } catch {
      // Do not release the reservation or retry: a timeout may occur after Paystack accepted the transfer.
      throw new ServiceUnavailableException('Transfer outcome is uncertain. The payout remains reserved and must be verified before retrying.');
    }
    return this.publicPayout(await this.payouts.findOneByOrFail({ id: payout.record.id }));
  }

  async verify(admin: User, reference: string) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(admin.role)) throw new ForbiddenException('Only administrators or moderators may verify payouts.');
    const payout = await this.payouts.findOne({ where: { reference } });
    if (!payout) throw new NotFoundException('Payout not found.');
    if ([PaymentPayoutStatus.SUCCESS, PaymentPayoutStatus.FAILED, PaymentPayoutStatus.REVERSED].includes(payout.status)) return this.publicPayout(payout);
    const transfer = await this.provider.verifyTransfer(reference);
    if (String(transfer.amountMinor) !== payout.amountMinor || transfer.currency !== payout.currency) {
      throw new ConflictException('Verified transfer amount or currency does not match the payout record.');
    }
    payout.status = this.mapStatus(transfer.status);
    payout.providerTransferCode = transfer.transferCode;
    payout.providerMetadata = { status: transfer.status };
    payout.completedAt = payout.status === PaymentPayoutStatus.SUCCESS ? new Date() : null;
    await this.payouts.save(payout);
    return this.publicPayout(payout);
  }

  async listRequests(admin: User) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(admin.role)) throw new ForbiddenException('Only administrators or moderators may inspect payout requests.');
    const records = await this.payouts.find({ order: { createdAt: 'DESC' }, take: 100 });
    return records.map(record => this.publicPayout(record));
  }

  private mapStatus(status: string): PaymentPayoutStatus {
    const value = status.toLowerCase();
    if (value === 'success') return PaymentPayoutStatus.SUCCESS;
    if (value === 'failed') return PaymentPayoutStatus.FAILED;
    if (value === 'reversed') return PaymentPayoutStatus.REVERSED;
    if (value === 'otp') return PaymentPayoutStatus.OTP;
    return PaymentPayoutStatus.PENDING;
  }

  private publicPayout(payout: PaymentPayout) {
    return { id: payout.id, reference: payout.reference, amountMinor: payout.amountMinor, currency: payout.currency,
      status: payout.status, createdAt: payout.createdAt, completedAt: payout.completedAt };
  }
}
