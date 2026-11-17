import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointWallet } from '../points/entities/point-wallet.entity';
import { PointTransaction } from '../points/entities/point-transaction.entity';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentLedgerEntry } from './entities/payment-ledger-entry.entity';
import { ResourcePurchase } from './entities/resource-purchase.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentTransaction, PaymentLedgerEntry, ResourcePurchase, PointWallet, PointTransaction, Resource, User])],
  controllers: [PaymentsController],
  providers: [
    PaystackProvider,
    { provide: PAYMENT_PROVIDER, useFactory: (paystack: PaystackProvider) => {
      const selected = (process.env.PAYMENT_PROVIDER || 'paystack').toLowerCase();
      if (selected !== 'paystack') throw new Error(`Unsupported PAYMENT_PROVIDER "${selected}". Add and register a provider adapter before selecting it.`);
      return paystack;
    }, inject: [PaystackProvider] },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
