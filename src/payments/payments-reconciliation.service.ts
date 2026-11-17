import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentRefund } from './entities/payment-refund.entity';
import { PaymentReconciliationRun } from './entities/payment-reconciliation-run.entity';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';

@Injectable()
export class PaymentsReconciliationService {
  constructor(
    @InjectRepository(PaymentTransaction) private readonly payments: Repository<PaymentTransaction>,
    @InjectRepository(PaymentRefund) private readonly refunds: Repository<PaymentRefund>,
    @InjectRepository(PaymentReconciliationRun) private readonly runs: Repository<PaymentReconciliationRun>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async reconcile(user: User, input: { from: string; to: string }) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) {
      throw new ForbiddenException('Only administrators and moderators may run payment reconciliation.');
    }
    const start = new Date(input.from);
    const end = new Date(input.to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start ||
        end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Provide a valid UTC date range no longer than 31 days.');
    }

    try {
      const [providerTransactions, providerRefunds] = await Promise.all([
        this.provider.listTransactions({ from: start.toISOString(), to: end.toISOString() }),
        this.provider.listRefunds({ from: start.toISOString(), to: end.toISOString() }),
      ]);
      const localPayments = await this.payments.createQueryBuilder('payment')
        .where('payment.provider = :provider', { provider: this.provider.name })
        .andWhere('payment.createdAt >= :start AND payment.createdAt < :end', { start, end }).getMany();
      const localRefunds = await this.refunds.createQueryBuilder('refund')
        .innerJoin(PaymentTransaction, 'payment', 'payment.id = refund.paymentId')
        .where('payment.provider = :provider', { provider: this.provider.name })
        .andWhere('refund.createdAt >= :start AND refund.createdAt < :end', { start, end }).getMany();

      const txByReference = new Map(providerTransactions.map(tx => [String(tx.reference || ''), tx]));
      const localByReference = new Map(localPayments.map(payment => [payment.reference, payment]));
      const discrepancies: Record<string, unknown>[] = [];
      for (const payment of localPayments) {
        const remote = txByReference.get(payment.reference);
        if (!remote) {
          discrepancies.push({ type: 'local_payment_missing_at_provider', reference: payment.reference, localStatus: payment.status });
          continue;
        }
        const remoteAmount = Number(remote.amount);
        const remoteCurrency = String(remote.currency || '').toUpperCase();
        const remoteStatus = String(remote.status || '').toLowerCase();
        if (!Number.isSafeInteger(remoteAmount) || remoteAmount !== Number(payment.amountMinor) ||
            remoteCurrency !== payment.currency || remoteStatus !== payment.status) {
          discrepancies.push({
            type: 'payment_mismatch', reference: payment.reference, localStatus: payment.status,
            providerStatus: remoteStatus, localAmountMinor: payment.amountMinor,
            providerAmountMinor: Number.isSafeInteger(remoteAmount) ? remoteAmount : null,
            localCurrency: payment.currency, providerCurrency: remoteCurrency,
          });
        }
      }
      for (const remote of providerTransactions) {
        const reference = String(remote.reference || '');
        if (reference && !localByReference.has(reference)) {
          discrepancies.push({ type: 'provider_payment_missing_locally', reference, providerStatus: String(remote.status || '') });
        }
      }

      const refundsByProviderId = new Map(providerRefunds.map(refund => [String(refund.id || ''), refund]));
      const localRefundIds = new Set(localRefunds.map(refund => refund.providerRefundId).filter((id): id is string => !!id));
      for (const refund of localRefunds) {
        if (!refund.providerRefundId) {
          discrepancies.push({ type: 'local_refund_without_provider_id', refundId: refund.id, status: refund.status });
          continue;
        }
        const remote = refundsByProviderId.get(refund.providerRefundId);
        if (!remote) {
          discrepancies.push({ type: 'local_refund_missing_at_provider', refundId: refund.id, providerRefundId: refund.providerRefundId });
          continue;
        }
        const amount = Number(remote.amount);
        const currency = String(remote.currency || '').toUpperCase();
        const status = String(remote.status || '').toLowerCase();
        if (!Number.isSafeInteger(amount) || amount !== Number(refund.amountMinor) ||
            currency !== refund.currency || status !== refund.status) {
          discrepancies.push({ type: 'refund_mismatch', refundId: refund.id, providerRefundId: refund.providerRefundId,
            localStatus: refund.status, providerStatus: status, localAmountMinor: refund.amountMinor,
            providerAmountMinor: Number.isSafeInteger(amount) ? amount : null, localCurrency: refund.currency, providerCurrency: currency });
        }
      }
      for (const remote of providerRefunds) {
        const id = String(remote.id || '');
        if (id && !localRefundIds.has(id)) discrepancies.push({ type: 'provider_refund_missing_locally', providerRefundId: id,
          providerStatus: String(remote.status || ''), amountMinor: remote.amount, currency: remote.currency });
      }

      const run = await this.runs.save(this.runs.create({
        provider: this.provider.name, periodStart: start, periodEnd: end, status: 'completed',
        providerTransactions: providerTransactions.length, localPayments: localPayments.length,
        providerRefunds: providerRefunds.length, localRefunds: localRefunds.length,
        discrepancies, initiatedByUserId: user.id,
      }));
      return { id: run.id, provider: run.provider, periodStart: run.periodStart, periodEnd: run.periodEnd,
        counts: { providerTransactions: run.providerTransactions, localPayments: run.localPayments,
          providerRefunds: run.providerRefunds, localRefunds: run.localRefunds },
        discrepancyCount: discrepancies.length, discrepancies, createdAt: run.createdAt,
        mode: 'read_only', note: 'No payment, refund, purchase, or ledger records were modified.' };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException('Reconciliation could not complete because the provider or database request failed.');
    }
  }

  async history(user: User) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) throw new ForbiddenException('Only administrators and moderators may inspect reconciliation history.');
    const rows = await this.runs.find({ order: { createdAt: 'DESC' }, take: 50 });
    return rows.map(({ id, provider, periodStart, periodEnd, status, providerTransactions, localPayments, providerRefunds, localRefunds, discrepancies, createdAt }) =>
      ({ id, provider, periodStart, periodEnd, status, counts: { providerTransactions, localPayments, providerRefunds, localRefunds }, discrepancyCount: discrepancies.length, discrepancies, createdAt }));
  }
}
