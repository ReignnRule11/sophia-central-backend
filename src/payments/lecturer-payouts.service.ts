import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
import { PaymentPayoutReconciliationRun } from './entities/payment-payout-reconciliation-run.entity';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
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
    @InjectRepository(PaymentPayoutReconciliationRun) private readonly payoutRuns: Repository<PaymentPayoutReconciliationRun>,
    private readonly providers: PaymentProviderRegistry,
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
    const provider = this.providers.defaultProvider();
    const resolved = await provider.resolveBankAccount(input.accountNumber, input.bankCode);
    const recipient = await provider.createTransferRecipient({
      name: resolved.accountName, accountNumber: resolved.accountNumber, bankCode: resolved.bankCode,
    });
    const beneficiary = existing
      ? await this.beneficiaries.save(Object.assign(existing, {
          provider: provider.name, recipientCode: recipient.recipientCode, accountName: recipient.accountName,
          bankName: resolved.bankName, accountLast4: resolved.accountNumber.slice(-4), currency: 'NGN',
        }))
      : await this.beneficiaries.save(this.beneficiaries.create({
          lecturerUserId: user.id, provider: provider.name, recipientCode: recipient.recipientCode,
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
      const provider = this.providers.defaultProvider();
      if (beneficiary.provider !== provider.name) throw new ConflictException('Your saved bank beneficiary belongs to a different payment provider. Re-verify your beneficiary with the active provider.');
      const available = await this.availableBalance(manager, user.id);
      if (BigInt(amountMinor) > available) throw new ConflictException('Payout amount exceeds the available lecturer balance.');
      const payout = manager.create(PaymentPayout, {
        lecturerUserId: user.id, beneficiaryId: beneficiary.id, reference: `sophis-payout-${randomBytes(16).toString('hex')}`,
        provider: provider.name, amountMinor, currency: 'NGN', status: PaymentPayoutStatus.REQUESTED,
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
      if (!beneficiary || beneficiary.provider !== record.provider) throw new ConflictException('Payout beneficiary is unavailable or belongs to another provider.');
      await manager.findOne(User, { where: { id: record.lecturerUserId }, lock: { mode: 'pessimistic_write' } });
      const available = await this.availableBalance(manager, record.lecturerUserId, record.id);
      if (BigInt(record.amountMinor) > available) throw new ConflictException('Available balance changed; this payout can no longer be approved.');
      record.status = PaymentPayoutStatus.PROCESSING;
      record.approvedByUserId = admin.id;
      await manager.save(PaymentPayout, record);
      return { record, beneficiary };
    });
    try {
      const transfer = await this.providers.get(payout.record.provider).initiateTransfer({
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
    const transfer = await this.providers.get(payout.provider).verifyTransfer(reference);
    await this.applyTransferStatus(payout.id, transfer, 'manual_verification');
    return this.publicPayout(await this.payouts.findOneByOrFail({ id: payout.id }));
  }


  async handleTransferWebhook(providerName: string, eventName: string, reference: string, _data: Record<string, any>) {
    const expectedEvents = ['transfer.success', 'transfer.failed', 'transfer.reversed', 'transfer.reversal', 'transfer.completed'];
    if (!expectedEvents.includes(eventName)) return { received: true, processed: false };
    const payout = await this.payouts.findOne({ where: { reference, provider: providerName } });
    if (!payout) return { received: true, processed: false };
    const transfer = await this.providers.get(payout.provider).verifyTransfer(reference);
    if (eventName === 'transfer.success' && !['success', 'successful'].includes(transfer.status.toLowerCase())) return { received: true, processed: false };
    if (eventName === 'transfer.completed' && !['success', 'successful', 'failed'].includes(transfer.status.toLowerCase())) return { received: true, processed: false };
    if (['transfer.reversed', 'transfer.reversal'].includes(eventName) && transfer.status.toLowerCase() !== 'reversed') return { received: true, processed: false };
    if (eventName === 'transfer.failed' && !['failed', 'abandoned', 'blocked', 'rejected'].includes(transfer.status.toLowerCase())) return { received: true, processed: false };
    await this.applyTransferStatus(payout.id, transfer, eventName);
    return { received: true, processed: true };
  }

  private async applyTransferStatus(payoutId: string, transfer: { reference: string; status: string; transferCode: string | null; amountMinor: number; currency: string; raw: Record<string, unknown> }, source: string) {
    await this.dataSource.transaction(async manager => {
      const payout = await manager.findOne(PaymentPayout, { where: { id: payoutId }, lock: { mode: 'pessimistic_write' } });
      if (!payout) throw new NotFoundException('Payout not found.');
      if (transfer.reference !== payout.reference || !Number.isSafeInteger(Number(transfer.amountMinor)) ||
          String(transfer.amountMinor) !== payout.amountMinor || transfer.currency !== payout.currency) {
        throw new ConflictException('Verified transfer reference, amount or currency does not match the payout record.');
      }
      const next = this.mapStatus(transfer.status);
      const terminal = [PaymentPayoutStatus.SUCCESS, PaymentPayoutStatus.FAILED, PaymentPayoutStatus.REVERSED];
      const currentTerminal = terminal.includes(payout.status);
      const nextTerminal = terminal.includes(next);
      // A confirmed reversal is the only allowed terminal-to-terminal transition.
      if (currentTerminal && payout.status !== next &&
          !(payout.status === PaymentPayoutStatus.SUCCESS && next === PaymentPayoutStatus.REVERSED)) return;
      if (currentTerminal && !nextTerminal) return;
      payout.status = next;
      payout.providerTransferCode = transfer.transferCode;
      payout.providerMetadata = { status: transfer.status, source };
      payout.failureReason = next === PaymentPayoutStatus.FAILED ? transfer.status : null;
      payout.completedAt = nextTerminal ? new Date() : null;
      await manager.save(PaymentPayout, payout);
    });
  }

  async reconcilePayouts(admin: User, input: { from: string; to: string; provider?: string }) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(admin.role)) throw new ForbiddenException('Only administrators and moderators may reconcile payouts.');
    const start = new Date(input.from), end = new Date(input.to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start ||
        end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Provide a valid UTC date range no longer than 31 days.');
    }
    const provider = input.provider ? this.providers.get(input.provider) : this.providers.defaultProvider();
    const [remote, local] = await Promise.all([
      provider.listTransfers({ from: start.toISOString(), to: end.toISOString() }),
      this.payouts.createQueryBuilder('payout')
        .where('payout.provider = :provider', { provider: provider.name })
        .andWhere('payout.createdAt >= :start AND payout.createdAt < :end', { start, end }).getMany(),
    ]);
    // Reconcile only transfers initiated by this payout workflow; a shared Paystack account
    // may contain unrelated transfers belonging to other products or operations.
    const sophisTransfers = remote.filter(item => String(item.reference || '').startsWith('sophis-payout-'));
    const eligibleLocal = local.filter(item => item.status !== PaymentPayoutStatus.REQUESTED);
    const remoteByReference = new Map(sophisTransfers.map(item => [String(item.reference || ''), item]));
    const localByReference = new Map(eligibleLocal.map(item => [item.reference, item]));
    const discrepancies: Record<string, unknown>[] = [];
    for (const payout of eligibleLocal) {
      const providerTransfer = remoteByReference.get(payout.reference);
      if (!providerTransfer) {
        discrepancies.push({ type: 'local_payout_missing_at_provider', reference: payout.reference, localStatus: payout.status });
        continue;
      }
      const amount = Number(providerTransfer.amount);
      const currency = String(providerTransfer.currency || '').toUpperCase();
      const status = String(providerTransfer.status || '').toLowerCase();
      const localStatus = payout.status === PaymentPayoutStatus.PROCESSING ? 'pending' : payout.status;
      const normalizedStatus = ['abandoned', 'blocked', 'rejected'].includes(status) ? 'failed' : ['new', 'processing', 'received', 'queued'].includes(status) ? 'pending' : ['successful'].includes(status) ? 'success' : status;
      if (!Number.isSafeInteger(amount) || amount !== Number(payout.amountMinor) ||
          currency !== payout.currency || normalizedStatus !== localStatus) {
        discrepancies.push({ type: 'payout_mismatch', reference: payout.reference, localStatus: payout.status,
          providerStatus: status, localAmountMinor: payout.amountMinor,
          providerAmountMinor: Number.isSafeInteger(amount) ? amount : null,
          localCurrency: payout.currency, providerCurrency: currency });
      }
    }
    for (const transfer of sophisTransfers) {
      const reference = String(transfer.reference || '');
      if (reference && !localByReference.has(reference)) discrepancies.push({
        type: 'provider_transfer_missing_locally', reference, providerStatus: String(transfer.status || ''),
        amountMinor: transfer.amount, currency: transfer.currency,
      });
    }
    const run = await this.payoutRuns.save(this.payoutRuns.create({
      provider: provider.name, periodStart: start, periodEnd: end, status: 'completed',
      providerTransfers: sophisTransfers.length, localPayouts: eligibleLocal.length, discrepancies, initiatedByUserId: admin.id,
    }));
    return { id: run.id, provider: run.provider, periodStart: run.periodStart, periodEnd: run.periodEnd,
      counts: { providerTransfers: run.providerTransfers, localPayouts: run.localPayouts },
      discrepancyCount: discrepancies.length, discrepancies, createdAt: run.createdAt, mode: 'read_only',
      note: 'This report does not change payout, payment, refund, or ledger records.' };
  }

  async payoutReconciliationHistory(admin: User) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(admin.role)) throw new ForbiddenException('Only administrators and moderators may inspect payout reconciliation history.');
    const rows = await this.payoutRuns.find({ order: { createdAt: 'DESC' }, take: 50 });
    return rows.map(run => ({ id: run.id, provider: run.provider, periodStart: run.periodStart, periodEnd: run.periodEnd,
      status: run.status, counts: { providerTransfers: run.providerTransfers, localPayouts: run.localPayouts },
      discrepancyCount: run.discrepancies.length, discrepancies: run.discrepancies, createdAt: run.createdAt }));
  }

  async listRequests(admin: User) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(admin.role)) throw new ForbiddenException('Only administrators or moderators may inspect payout requests.');
    const records = await this.payouts.find({ order: { createdAt: 'DESC' }, take: 100 });
    return records.map(record => this.publicPayout(record));
  }

  private mapStatus(status: string): PaymentPayoutStatus {
    const value = status.toLowerCase();
    if (['success', 'successful'].includes(value)) return PaymentPayoutStatus.SUCCESS;
    if (['failed', 'abandoned', 'blocked', 'rejected'].includes(value)) return PaymentPayoutStatus.FAILED;
    if (value === 'reversed') return PaymentPayoutStatus.REVERSED;
    if (value === 'otp') return PaymentPayoutStatus.OTP;
    if (['new', 'pending', 'processing', 'received', 'queued'].includes(value)) return PaymentPayoutStatus.PENDING;
    throw new ConflictException('Payment provider returned an unsupported transfer status; payout reservation remains unchanged.');
  }

  private publicPayout(payout: PaymentPayout) {
    return { id: payout.id, reference: payout.reference, amountMinor: payout.amountMinor, currency: payout.currency,
      status: payout.status, createdAt: payout.createdAt, completedAt: payout.completedAt };
  }
}
