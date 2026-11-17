import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentPurpose { WISDOM_POINTS_TOPUP = 'wisdom_points_topup', RESOURCE_PURCHASE = 'resource_purchase' }
export enum PaymentStatus { PENDING = 'pending', SUCCESS = 'success', FAILED = 'failed' }

@Entity({ name: 'payment_transactions' })
@Index('UQ_payment_transactions_reference', ['reference'], { unique: true })
@Index('UQ_payment_transactions_user_idempotency', ['userId', 'idempotencyKey'], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ type: 'varchar', length: 64 }) reference!: string;
  @Column({ type: 'varchar', length: 128, nullable: true }) idempotencyKey!: string | null;
  @Column({ type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 32 }) purpose!: PaymentPurpose;
  @Column({ type: 'varchar', length: 16, default: PaymentStatus.PENDING }) status!: PaymentStatus;
  @Column({ type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'varchar', length: 3, default: 'NGN' }) currency!: string;
  @Column({ type: 'integer', nullable: true }) points!: number | null;
  @Column({ type: 'uuid', nullable: true }) resourceId!: string | null;
  @Column({ type: 'text', nullable: true }) checkoutUrl!: string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) providerTransactionId!: string | null;
  @Column({ type: 'jsonb', nullable: true }) providerMetadata!: Record<string, unknown> | null;
  @Column({ type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
