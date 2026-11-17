import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PointWallet } from '../points/entities/point-wallet.entity';
import { PointTransaction, PointTransactionType } from '../points/entities/point-transaction.entity';
import { Resource, CustomPriceStatus, ResourceModerationStatus, ResourcePricingMode } from '../resources/entities/resource.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { PaymentLedgerEntry, PaymentLedgerKind } from './entities/payment-ledger-entry.entity';
import { PaymentTransaction, PaymentPurpose, PaymentStatus } from './entities/payment-transaction.entity';
import { ResourcePurchase } from './entities/resource-purchase.entity';
import { PaymentRefund, PaymentRefundStatus } from './entities/payment-refund.entity';
import { PaymentDispute, PaymentDisputeStatus } from './entities/payment-dispute.entity';
import { PaymentLedgerAdjustment, PaymentLedgerAdjustmentKind } from './entities/payment-ledger-adjustment.entity';
import { VerifiedPayment, ProviderRefund } from './providers/payment-provider.interface';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { randomBytes } from 'node:crypto';
import { LecturerPayoutsService } from './lecturer-payouts.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentTransaction) private readonly payments: Repository<PaymentTransaction>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourcePurchase) private readonly purchases: Repository<ResourcePurchase>,
    @InjectRepository(PaymentRefund) private readonly refunds: Repository<PaymentRefund>,
    @InjectRepository(PaymentDispute) private readonly disputes: Repository<PaymentDispute>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly providers: PaymentProviderRegistry,
    private readonly lecturerPayouts: LecturerPayoutsService,
  ) {}

  private async getPrice(user: User, dto: InitializePaymentDto, allowPending = false): Promise<{ amountNaira: number; points: number | null; resourceId: string | null }> {
    if (user.role !== UserRole.STUDENT || user.isSuspended || user.accountStatus !== 'active') {
      throw new ForbiddenException('Only active student accounts can initiate purchases.');
    }
    if (dto.purpose === PaymentPurpose.WISDOM_POINTS_TOPUP) {
      if (!dto.packageId || dto.resourceId) throw new BadRequestException('A valid packageId is required for a Wisdom Points top-up.');
      let packages: Record<string, { amountNaira: number; points: number }>;
      try { packages = JSON.parse(this.config.get<string>('PAYMENT_WISDOM_PACKAGES') || '{}'); }
      catch { throw new ServiceUnavailableException('Wisdom Points packages are not configured correctly.'); }
      const selected = packages[dto.packageId];
      if (!selected || !Number.isInteger(selected.amountNaira) || selected.amountNaira < 1 || !Number.isInteger(selected.points) || selected.points < 1) {
        throw new BadRequestException('This Wisdom Points package is unavailable.');
      }
      return { amountNaira: selected.amountNaira, points: selected.points, resourceId: null };
    }
    if (!dto.resourceId || dto.packageId) throw new BadRequestException('A resourceId is required for a resource purchase.');
    const resource = await this.resources.findOne({ where: { id: dto.resourceId } });
    if (!resource) throw new NotFoundException('Resource not found.');
    if (resource.moderationStatus !== ResourceModerationStatus.APPROVED || !resource.isVerified) {
      throw new BadRequestException('Only approved and verified resources can be purchased.');
    }
    if (resource.pricingMode === ResourcePricingMode.FREE) throw new BadRequestException('This resource is free and does not require checkout.');
    if (resource.pricingMode === ResourcePricingMode.CUSTOM && resource.customPriceStatus !== CustomPriceStatus.APPROVED) {
      throw new BadRequestException('This resource custom price has not been approved.');
    }
    if (!Number.isInteger(resource.priceAmount) || !resource.priceAmount || resource.priceAmount < 1) {
      throw new BadRequestException('This resource does not have a valid approved price.');
    }
    if (resource.pricingMode === ResourcePricingMode.FIXED && resource.priceAmount > 3000) {
      throw new BadRequestException('Fixed resource prices cannot exceed ₦3,000.');
    }
    if (resource.uploaderId === user.id) throw new ForbiddenException('You cannot purchase your own resource.');
    const existing = await this.purchases.findOne({ where: { userId: user.id, resourceId: resource.id } });
    if (existing && !allowPending) throw new ConflictException('You already own this resource.');
    const pending = allowPending ? null : await this.payments.findOne({ where: { userId: user.id, resourceId: resource.id, status: PaymentStatus.PENDING } });
    if (pending) throw new ConflictException('A checkout for this resource is already pending. Verify its payment status before starting another checkout.');
    return { amountNaira: resource.priceAmount, points: null, resourceId: resource.id };
  }

  async initialize(user: User, dto: InitializePaymentDto, idempotencyKey?: string) {
    const key = idempotencyKey?.trim();
    if (key && (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key))) {
      throw new BadRequestException('Idempotency-Key must be 8–128 characters and contain only letters, numbers, dots, underscores, colons or hyphens.');
    }
    const price = await this.getPrice(user, dto, Boolean(key));
    if (key) {
      const existing = await this.payments.findOne({ where: { userId: user.id, idempotencyKey: key } });
      if (existing) return this.replayCheckout(existing, dto, price);
    }
    const callbackUrl = this.config.get<string>('PAYMENT_CALLBACK_URL');
    if (!callbackUrl || !/^https:\/\//i.test(callbackUrl)) {
      throw new ServiceUnavailableException('A secure PAYMENT_CALLBACK_URL must be configured before checkout.');
    }
    const provider = this.providers.defaultProvider();
    const reference = `SOPHIS-${Date.now()}-${randomBytes(8).toString('hex')}`;
    let payment = this.payments.create({
      provider: provider.name,
      reference,
      userId: user.id,
      idempotencyKey: key || null,
      purpose: dto.purpose,
      status: PaymentStatus.PENDING,
      amountMinor: String(price.amountNaira * 100),
      currency: 'NGN',
      points: price.points,
      resourceId: price.resourceId,
      checkoutUrl: null,
      providerTransactionId: null,
      providerMetadata: null,
      paidAt: null,
    });
    try {
      payment = await this.payments.save(payment);
    } catch (error: any) {
      if (key && error?.code === '23505') {
        const existing = await this.payments.findOne({ where: { userId: user.id, idempotencyKey: key } });
        if (existing) return this.replayCheckout(existing, dto, price);
      }
      throw error;
    }
    try {
      const initialized = await provider.initialize({
        email: user.email,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reference,
        callbackUrl,
        metadata: { paymentId: payment.id, userId: user.id, purpose: payment.purpose },
      });
      payment.checkoutUrl = initialized.authorizationUrl;
      payment.providerMetadata = { authorization: initialized.raw };
      await this.payments.save(payment);
      return { reference, provider: provider.name, checkoutUrl: initialized.authorizationUrl, amountMinor: payment.amountMinor, currency: payment.currency, status: payment.status };
    } catch (error) {
      // Keep the intent pending: a provider timeout can happen after the provider
      // accepted the transaction. Reconciliation must verify before retrying.
      throw error;
    }
  }

  private replayCheckout(payment: PaymentTransaction, dto: InitializePaymentDto, price: { amountNaira: number; points: number | null; resourceId: string | null }) {
    if (payment.purpose !== dto.purpose || payment.resourceId !== price.resourceId ||
        payment.points !== price.points || BigInt(payment.amountMinor) !== BigInt(price.amountNaira * 100)) {
      throw new ConflictException('This Idempotency-Key was already used for a different checkout request.');
    }
    return { reference: payment.reference, provider: payment.provider, checkoutUrl: payment.checkoutUrl,
      amountMinor: payment.amountMinor, currency: payment.currency, status: payment.status, replayed: true };
  }

  async verifyForUser(user: User, reference: string) {
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment reference not found.');
    if (payment.userId !== user.id && ![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) {
      throw new ForbiddenException('You cannot inspect another user payment.');
    }
    if (payment.status === PaymentStatus.SUCCESS) return this.publicPayment(payment);
    const provider = this.providers.get(payment.provider);
    const verified = await provider.verify(reference);
    await this.applyVerifiedPayment(payment.id, verified);
    const updated = await this.payments.findOne({ where: { id: payment.id } });
    return this.publicPayment(updated!);
  }


  async createRefund(user: User, paymentReference: string, input: { idempotencyKey: string; amountMinor?: number; reason: string }) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) throw new ForbiddenException('Only administrators and moderators may initiate refunds.');
    if (!input.idempotencyKey?.trim() || !input.reason?.trim()) throw new BadRequestException('An idempotency key and reason are required.');
    const existing = await this.refunds.findOne({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return this.publicRefund(existing);
    const refund = await this.dataSource.transaction(async manager => {
      const payment = await manager.findOne(PaymentTransaction, { where: { reference: paymentReference }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Payment reference not found.');
      if (payment.status !== PaymentStatus.SUCCESS || payment.purpose !== PaymentPurpose.RESOURCE_PURCHASE) {
        throw new BadRequestException('Only successful resource purchases can be refunded in this release.');
      }
      const reservations = await manager.createQueryBuilder(PaymentRefund, 'refund')
        .select('COALESCE(SUM(CAST(refund.amountMinor AS BIGINT)), 0)', 'total')
        .where('refund.paymentId = :paymentId', { paymentId: payment.id })
        .andWhere('refund.status IN (:...statuses)', { statuses: [PaymentRefundStatus.PENDING, PaymentRefundStatus.PROCESSING, PaymentRefundStatus.NEEDS_ATTENTION, PaymentRefundStatus.PROCESSED] })
        .getRawOne();
      const alreadyReserved = BigInt(reservations?.total || 0);
      const total = BigInt(payment.amountMinor);
      const requested = input.amountMinor === undefined ? total - alreadyReserved : BigInt(input.amountMinor);
      if (requested <= 0n || requested > total - alreadyReserved) throw new ConflictException('Refund amount exceeds the remaining refundable balance.');
      const record = manager.create(PaymentRefund, {
        paymentId: payment.id,
        idempotencyKey: input.idempotencyKey,
        reference: `SOPHIS-REF-${randomBytes(16).toString('hex')}`,
        providerRefundId: null,
        amountMinor: requested.toString(),
        currency: payment.currency,
        status: PaymentRefundStatus.PENDING,
        requestedByUserId: user.id,
        reason: input.reason.trim(),
        providerMetadata: null,
        processedAt: null,
      });
      return manager.save(PaymentRefund, record);
    });
    const payment = await this.payments.findOneByOrFail({ id: refund.paymentId });
    const provider = this.providers.get(payment.provider);
    try {
      const providerRefund = await provider.createRefund({
        transactionReference: payment.provider === 'flutterwave' ? (payment.providerTransactionId || '') : payment.reference,
        amountMinor: refund.amountMinor,
        currency: refund.currency,
        reference: refund.reference,
        reason: refund.reason,
      });
      if (providerRefund.currency !== refund.currency || BigInt(providerRefund.amountMinor) !== BigInt(refund.amountMinor)) {
        throw new ConflictException('Payment provider refund response amount or currency does not match the recorded request.');
      }
      await this.refunds.update({ id: refund.id }, {
        providerRefundId: providerRefund.id,
        providerMetadata: { providerStatus: providerRefund.status },
      });
      const verifiedRefund = await provider.verifyRefund(providerRefund.id);
      await this.applyRefundStatus(refund.id, verifiedRefund);
    } catch (error) {
      // Keep the reservation pending when the provider request outcome is uncertain.
      // This prevents a timeout from enabling a duplicate refund.
      if (error instanceof ConflictException) throw error;
    }
    const latest = await this.refunds.findOneByOrFail({ id: refund.id });
    return this.publicRefund(latest);
  }

  async listDisputes(user: User) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) throw new ForbiddenException('Only administrators and moderators may inspect payment disputes.');
    const records = await this.disputes.find({ order: { createdAt: 'DESC' }, take: 100 });
    return records.map(dispute => ({
      id: dispute.id, paymentId: dispute.paymentId, providerDisputeId: dispute.providerDisputeId,
      amountMinor: dispute.amountMinor, currency: dispute.currency, status: dispute.status,
      reason: dispute.reason, responseDueAt: dispute.responseDueAt, resolvedAt: dispute.resolvedAt,
      createdAt: dispute.createdAt,
    }));
  }

  async verifyRefund(user: User, refundId: string) {
    if (![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) throw new ForbiddenException('Only administrators and moderators may inspect refunds.');
    const refund = await this.refunds.findOne({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund not found.');
    if (!refund.providerRefundId) return this.publicRefund(refund);
    const payment = await this.payments.findOneByOrFail({ id: refund.paymentId });
    const provider = this.providers.get(payment.provider);
    const verified = await provider.verifyRefund(refund.providerRefundId);
    await this.applyRefundStatus(refund.id, verified);
    return this.publicRefund(await this.refunds.findOneByOrFail({ id: refund.id }));
  }

  private publicRefund(refund: PaymentRefund) {
    return { id: refund.id, paymentId: refund.paymentId, reference: refund.reference, amountMinor: refund.amountMinor, currency: refund.currency, status: refund.status, reason: refund.reason, createdAt: refund.createdAt, processedAt: refund.processedAt };
  }

  private async applyRefundStatus(refundId: string, providerRefund: ProviderRefund) {
    const statusMap: Record<string, PaymentRefundStatus | undefined> = {
      pending: PaymentRefundStatus.PENDING,
      processing: PaymentRefundStatus.PROCESSING,
      'needs-attention': PaymentRefundStatus.NEEDS_ATTENTION,
      failed: PaymentRefundStatus.FAILED,
      processed: PaymentRefundStatus.PROCESSED,
    };
    const status = statusMap[providerRefund.status.toLowerCase()];
    if (!status) throw new ConflictException('Payment provider returned an unsupported refund status.');
    await this.dataSource.transaction(async manager => {
      const refund = await manager.findOne(PaymentRefund, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
      if (!refund) throw new NotFoundException('Refund not found.');
      if (refund.status === PaymentRefundStatus.PROCESSED) return;
      if (providerRefund.currency !== refund.currency || BigInt(providerRefund.amountMinor) !== BigInt(refund.amountMinor)) {
        throw new ConflictException('Verified refund amount or currency does not match the refund record.');
      }
      const payment = await manager.findOne(PaymentTransaction, { where: { id: refund.paymentId }, lock: { mode: 'pessimistic_write' } });
      if (!payment) throw new NotFoundException('Original payment not found.');
      refund.status = status;
      refund.providerRefundId = providerRefund.id;
      refund.providerMetadata = { providerStatus: providerRefund.status };
      if (status === PaymentRefundStatus.PROCESSED) {
        refund.processedAt = new Date();
        const totals = await manager.createQueryBuilder(PaymentRefund, 'refund')
          .select('COALESCE(SUM(CAST(refund.amountMinor AS BIGINT)), 0)', 'total')
          .where('refund.paymentId = :paymentId', { paymentId: payment.id })
          .andWhere('(refund.status = :status OR refund.id = :currentId)', { status: PaymentRefundStatus.PROCESSED, currentId: refund.id })
          .getRawOne();
        const cumulativeRefunded = BigInt(totals?.total || 0);
        const ledger = await manager.find(PaymentLedgerEntry, { where: { paymentId: payment.id } });
        for (const entry of ledger) {
          const kind = entry.kind === PaymentLedgerKind.PLATFORM_SHARE
            ? PaymentLedgerAdjustmentKind.PLATFORM_REFUND : PaymentLedgerAdjustmentKind.LECTURER_REFUND;
          const prior = await manager.createQueryBuilder(PaymentLedgerAdjustment, 'adjustment')
            .select('COALESCE(SUM(CAST(adjustment.amountMinor AS BIGINT)), 0)', 'total')
            .where('adjustment.paymentId = :paymentId AND adjustment.kind = :kind', { paymentId: payment.id, kind })
            .getRawOne();
          const target = (cumulativeRefunded * BigInt(entry.amountMinor)) / BigInt(payment.amountMinor);
          const delta = target - BigInt(prior?.total || 0);
          if (delta <= 0n) continue;
          await manager.createQueryBuilder().insert().into(PaymentLedgerAdjustment).values({
            refundId: refund.id, paymentId: payment.id, kind, beneficiaryUserId: entry.beneficiaryUserId,
            amountMinor: delta.toString(), currency: refund.currency,
          }).orIgnore().execute();
        }
        if (cumulativeRefunded >= BigInt(payment.amountMinor) && payment.resourceId) {
          await manager.delete(ResourcePurchase, { paymentId: payment.id });
        }
      }
      await manager.save(PaymentRefund, refund);
    });
  }

  private async applyDisputeEvent(providerName: string, eventName: string, paymentReference: string, data: Record<string, any>) {
    const payment = await this.payments.findOne({ where: { reference: paymentReference, provider: providerName, status: PaymentStatus.SUCCESS } });
    const disputeId = data.id === undefined ? null : String(data.id);
    if (!payment || !disputeId) return;
    const existing = await this.disputes.findOne({ where: { providerDisputeId: disputeId } });
    if (eventName === 'charge.dispute.create' || eventName === 'charge.dispute.remind') {
      const amount = Number(data.amount);
      if (existing) {
        if (eventName === 'charge.dispute.remind' && existing.status === PaymentDisputeStatus.OPEN) {
          existing.status = PaymentDisputeStatus.UNDER_REVIEW;
          if (data.due_at) existing.responseDueAt = new Date(data.due_at);
          await this.disputes.save(existing);
        }
        return;
      }
      const currency = String(data.currency || payment.currency).toUpperCase();
      if (!Number.isSafeInteger(amount) || amount < 1 || currency !== payment.currency) return;
      await this.disputes.save(this.disputes.create({
        paymentId: payment.id, providerDisputeId: disputeId, amountMinor: String(amount), currency,
        status: eventName === 'charge.dispute.create' ? PaymentDisputeStatus.OPEN : PaymentDisputeStatus.UNDER_REVIEW,
        reason: typeof data.reason === 'string' ? data.reason.slice(0, 128) : null,
        responseDueAt: data.due_at ? new Date(data.due_at) : null,
        providerMetadata: null, resolvedAt: null,
      }));
      return;
    }
    if (eventName === 'charge.dispute.resolve' && existing) {
      const resolution = String(data.status || data.resolution || '').toLowerCase();
      existing.status = ['won', 'merchant_won', 'resolved_won'].includes(resolution) ? PaymentDisputeStatus.WON
        : ['lost', 'customer_won', 'resolved_lost'].includes(resolution) ? PaymentDisputeStatus.LOST
        : PaymentDisputeStatus.CLOSED;
      existing.resolvedAt = new Date();
      await this.disputes.save(existing);
    }
  }

  private publicPayment(payment: PaymentTransaction) {
    return { reference: payment.reference, provider: payment.provider, purpose: payment.purpose, status: payment.status, amountMinor: payment.amountMinor, currency: payment.currency, paidAt: payment.paidAt };
  }

  async handleWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    const provider = this.providers.get(providerName);
    const event = provider.verifyWebhook(rawBody, headers);
    if (!event) return { received: true, processed: false };
    if (event.event.startsWith('transfer.')) {
      return this.lecturerPayouts.handleTransferWebhook(providerName, event.event, event.reference, event.data || {});
    }
    if (event.event === 'charge.success' || event.event === 'charge.completed') {
      const payment = await this.payments.findOne({ where: { reference: event.reference } });
      if (!payment || payment.provider !== providerName) return { received: true, processed: false };
      if (payment.status === PaymentStatus.SUCCESS) return { received: true, processed: true, duplicate: true };
      const verified = await provider.verify(event.reference);
      await this.applyVerifiedPayment(payment.id, verified);
      return { received: true, processed: true };
    }
    if (event.event.startsWith('refund.')) {
      const data = event.data || {};
      let refund = data.id ? await this.refunds.findOne({ where: { providerRefundId: String(data.id) } }) : null;
      if (!refund) {
        const candidates = await this.refunds.find({ where: { status: PaymentRefundStatus.PENDING } });
        refund = candidates.find(item => item.reference === data.refund_reference || item.paymentId === event.reference) || null;
      }
      if (!refund || !refund.providerRefundId) return { received: true, processed: false };
      const payment = await this.payments.findOneByOrFail({ id: refund.paymentId });
      if (payment.provider !== providerName) return { received: true, processed: false };
      const provider = this.providers.get(payment.provider);
      const verifiedRefund = await provider.verifyRefund(refund.providerRefundId);
      await this.applyRefundStatus(refund.id, verifiedRefund);
      return { received: true, processed: true };
    }
    if (event.event.startsWith('charge.dispute.')) {
      await this.applyDisputeEvent(providerName, event.event, event.reference, event.data || {});
      return { received: true, processed: true };
    }
    return { received: true, processed: false };
  }

  private async applyVerifiedPayment(paymentId: string, verified: VerifiedPayment): Promise<void> {
    if (verified.status !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(verified.status)) {
        await this.payments.update({ id: paymentId, status: PaymentStatus.PENDING }, { status: PaymentStatus.FAILED, providerMetadata: { verification: verified.raw } });
      }
      return;
    }
    await this.dataSource.transaction(async manager => {
      const payment = await manager.findOne(PaymentTransaction, { where: { id: paymentId }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.status === PaymentStatus.SUCCESS) return;
      if (verified.reference !== payment.reference || String(verified.amountMinor) !== payment.amountMinor || verified.currency !== payment.currency) {
        throw new ConflictException('Verified payment details do not match the recorded payment intent.');
      }
      payment.status = PaymentStatus.SUCCESS;
      payment.providerTransactionId = verified.providerTransactionId;
      payment.providerMetadata = { verification: verified.raw };
      payment.paidAt = verified.paidAt || new Date();
      await manager.save(PaymentTransaction, payment);

      if (payment.purpose === PaymentPurpose.WISDOM_POINTS_TOPUP) {
        if (!payment.points || payment.points < 1) throw new ConflictException('The recorded top-up has no valid point quantity.');
        await manager.query('INSERT INTO point_wallets ("userId", balance) VALUES ($1, 0) ON CONFLICT ("userId") DO NOTHING', [payment.userId]);
        const wallet = await manager.findOne(PointWallet, { where: { userId: payment.userId }, lock: { mode: 'pessimistic_write' } });
        if (!wallet) throw new ConflictException('The Wisdom Points wallet could not be initialized.');
        wallet.balance += payment.points;
        await manager.save(PointWallet, wallet);
        await manager.save(PointTransaction, manager.create(PointTransaction, {
          userId: payment.userId,
          type: PointTransactionType.EARNED,
          amount: payment.points,
          reason: `Paid Wisdom Points top-up: ${payment.reference}`,
        }));
        return;
      }

      if (!payment.resourceId) throw new ConflictException('The resource purchase intent is incomplete.');
      const resource = await manager.findOne(Resource, { where: { id: payment.resourceId } });
      if (!resource || !resource.uploaderId) throw new ConflictException('The resource owner could not be verified.');
      const existing = await manager.findOne(ResourcePurchase, { where: { userId: payment.userId, resourceId: payment.resourceId } });
      if (existing) throw new ConflictException('A completed purchase already exists for this resource. The duplicate charge requires reconciliation.');
      await manager.save(ResourcePurchase, manager.create(ResourcePurchase, {
        userId: payment.userId, resourceId: payment.resourceId, paymentId: payment.id, purchasedAt: payment.paidAt,
      }));
      const gross = BigInt(payment.amountMinor);
      const platformShare = (gross * 30n) / 100n;
      const lecturerShare = gross - platformShare;
      await manager.save(PaymentLedgerEntry, [
        manager.create(PaymentLedgerEntry, { paymentId: payment.id, kind: PaymentLedgerKind.PLATFORM_SHARE, beneficiaryUserId: null, amountMinor: platformShare.toString(), currency: payment.currency }),
        manager.create(PaymentLedgerEntry, { paymentId: payment.id, kind: PaymentLedgerKind.LECTURER_SHARE, beneficiaryUserId: resource.uploaderId, amountMinor: lecturerShare.toString(), currency: payment.currency }),
      ]);
    });
  }
}
