import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointWallet } from '../points/entities/point-wallet.entity';
import { PointTransaction } from '../points/entities/point-transaction.entity';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentLedgerEntry } from './entities/payment-ledger-entry.entity';
import { ResourcePurchase } from './entities/resource-purchase.entity';
import { PaymentRefund } from './entities/payment-refund.entity';
import { PaymentDispute } from './entities/payment-dispute.entity';
import { PaymentLedgerAdjustment } from './entities/payment-ledger-adjustment.entity';
import { PaymentReconciliationRun } from './entities/payment-reconciliation-run.entity';
import { PaymentPayout } from './entities/payment-payout.entity';
import { PaymentPayoutBeneficiary } from './entities/payment-payout-beneficiary.entity';
import { PaymentPayoutReconciliationRun } from './entities/payment-payout-reconciliation-run.entity';
import { LecturerPayoutsService } from './lecturer-payouts.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsReconciliationService } from './payments-reconciliation.service';
import { PaystackProvider } from './providers/paystack.provider';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentTransaction, PaymentLedgerEntry, ResourcePurchase, PointWallet, PointTransaction, Resource, User, PaymentRefund, PaymentDispute, PaymentLedgerAdjustment, PaymentReconciliationRun, PaymentPayout, PaymentPayoutBeneficiary, PaymentPayoutReconciliationRun])],
  controllers: [PaymentsController],
  providers: [
    PaystackProvider,
    FlutterwaveProvider,
    PaymentProviderRegistry,
    PaymentsService,
    PaymentsReconciliationService,
    LecturerPayoutsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
