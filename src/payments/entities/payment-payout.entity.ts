import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentPayoutStatus { REQUESTED='requested', PROCESSING='processing', PENDING='pending', SUCCESS='success', FAILED='failed', REVERSED='reversed', OTP='otp' }

@Entity({ name: 'payment_payouts' })
@Index('UQ_payment_payout_reference', ['reference'], { unique: true })
@Index('IDX_payment_payout_lecturer_status', ['lecturerUserId', 'status'])
export class PaymentPayout {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) lecturerUserId!: string;
  @Column({ type: 'uuid' }) beneficiaryId!: string;
  @Column({ type: 'varchar', length: 64 }) reference!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'varchar', length: 3, default: 'NGN' }) currency!: string;
  @Column({ type: 'varchar', length: 24, default: PaymentPayoutStatus.REQUESTED }) status!: PaymentPayoutStatus;
  @Column({ type: 'uuid', nullable: true }) approvedByUserId!: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) providerTransferCode!: string | null;
  @Column({ type: 'jsonb', nullable: true }) providerMetadata!: Record<string, unknown> | null;
  @Column({ type: 'text', nullable: true }) failureReason!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
