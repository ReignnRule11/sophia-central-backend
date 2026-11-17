import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
import { PAYMENT_PROVIDER, PaymentProvider, VerifiedPayment } from './providers/payment-provider.interface';
import { randomBytes } from 'node:crypto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentTransaction) private readonly payments: Repository<PaymentTransaction>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourcePurchase) private readonly purchases: Repository<ResourcePurchase>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  private async getPrice(user: User, dto: InitializePaymentDto): Promise<{ amountNaira: number; points: number | null; resourceId: string | null }> {
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
    if (existing) throw new ConflictException('You already own this resource.');
    const pending = await this.payments.findOne({ where: { userId: user.id, resourceId: resource.id, status: PaymentStatus.PENDING } });
    if (pending) throw new ConflictException('A checkout for this resource is already pending. Verify its payment status before starting another checkout.');
    return { amountNaira: resource.priceAmount, points: null, resourceId: resource.id };
  }

  async initialize(user: User, dto: InitializePaymentDto) {
    const price = await this.getPrice(user, dto);
    const callbackUrl = this.config.get<string>('PAYMENT_CALLBACK_URL');
    if (!callbackUrl || !/^https:\/\//i.test(callbackUrl)) {
      throw new ServiceUnavailableException('A secure PAYMENT_CALLBACK_URL must be configured before checkout.');
    }
    const reference = `SOPHIS-${Date.now()}-${randomBytes(8).toString('hex')}`;
    const payment = await this.payments.save(this.payments.create({
      provider: this.provider.name,
      reference,
      userId: user.id,
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
    }));
    try {
      const initialized = await this.provider.initialize({
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
      return { reference, provider: this.provider.name, checkoutUrl: initialized.authorizationUrl, amountMinor: payment.amountMinor, currency: payment.currency, status: payment.status };
    } catch (error) {
      // Keep the intent pending: a provider timeout can happen after the provider
      // accepted the transaction. Reconciliation must verify before retrying.
      throw error;
    }
  }

  async verifyForUser(user: User, reference: string) {
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment reference not found.');
    if (payment.userId !== user.id && ![UserRole.ADMIN, UserRole.MODERATOR].includes(user.role)) {
      throw new ForbiddenException('You cannot inspect another user payment.');
    }
    if (payment.status === PaymentStatus.SUCCESS) return this.publicPayment(payment);
    if (payment.provider !== this.provider.name) throw new ServiceUnavailableException('The configured payment provider does not match this transaction.');
    const verified = await this.provider.verify(reference);
    await this.applyVerifiedPayment(payment.id, verified);
    const updated = await this.payments.findOne({ where: { id: payment.id } });
    return this.publicPayment(updated!);
  }

  private publicPayment(payment: PaymentTransaction) {
    return { reference: payment.reference, provider: payment.provider, purpose: payment.purpose, status: payment.status, amountMinor: payment.amountMinor, currency: payment.currency, paidAt: payment.paidAt };
  }

  async handleWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    if (providerName !== this.provider.name) throw new NotFoundException('Payment provider webhook is not enabled.');
    const event = this.provider.verifyWebhook(rawBody, headers);
    if (!event) return { received: true, processed: false };
    if (event.event !== 'charge.success') return { received: true, processed: false };
    const payment = await this.payments.findOne({ where: { reference: event.reference } });
    if (!payment || payment.provider !== providerName) return { received: true, processed: false };
    if (payment.status === PaymentStatus.SUCCESS) return { received: true, processed: true, duplicate: true };
    const verified = await this.provider.verify(event.reference);
    await this.applyVerifiedPayment(payment.id, verified);
    return { received: true, processed: true };
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
