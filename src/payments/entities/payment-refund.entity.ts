import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentRefundStatus { PENDING='pending', PROCESSING='processing', NEEDS_ATTENTION='needs-attention', FAILED='failed', PROCESSED='processed' }

@Entity({ name: 'payment_refunds' })
@Index('UQ_payment_refunds_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('IDX_payment_refunds_payment_status', ['paymentId', 'status'])
export class PaymentRefund {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) paymentId!: string;
  @Column({ type: 'varchar', length: 64 }) idempotencyKey!: string;
  @Column({ type: 'varchar', length: 64, unique: true }) reference!: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) providerRefundId!: string | null;
  @Column({ type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 24, default: PaymentRefundStatus.PENDING }) status!: PaymentRefundStatus;
  @Column({ type: 'uuid' }) requestedByUserId!: string;
  @Column({ type: 'varchar', length: 500 }) reason!: string;
  @Column({ type: 'jsonb', nullable: true }) providerMetadata!: Record<string, unknown> | null;
  @Column({ type: 'timestamptz', nullable: true }) processedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
