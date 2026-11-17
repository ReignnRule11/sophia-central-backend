import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum PaymentLedgerAdjustmentKind { PLATFORM_REFUND='platform_refund', LECTURER_REFUND='lecturer_refund' }

@Entity({ name: 'payment_ledger_adjustments' })
@Index('UQ_payment_ledger_adjustment_refund_kind', ['refundId', 'kind'], { unique: true })
export class PaymentLedgerAdjustment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) refundId!: string;
  @Column({ type: 'uuid' }) paymentId!: string;
  @Column({ type: 'varchar', length: 24 }) kind!: PaymentLedgerAdjustmentKind;
  @Column({ type: 'uuid', nullable: true }) beneficiaryUserId!: string | null;
  @Column({ type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @CreateDateColumn() createdAt!: Date;
}
