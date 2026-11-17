import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentDisputeStatus { OPEN='open', UNDER_REVIEW='under_review', WON='won', LOST='lost', CLOSED='closed' }

@Entity({ name: 'payment_disputes' })
@Index('UQ_payment_disputes_provider_id', ['providerDisputeId'], { unique: true })
@Index('IDX_payment_disputes_payment_status', ['paymentId', 'status'])
export class PaymentDispute {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) paymentId!: string;
  @Column({ type: 'varchar', length: 64 }) providerDisputeId!: string;
  @Column({ type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 32, default: PaymentDisputeStatus.OPEN }) status!: PaymentDisputeStatus;
  @Column({ type: 'varchar', length: 128, nullable: true }) reason!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) responseDueAt!: Date | null;
  @Column({ type: 'jsonb', nullable: true }) providerMetadata!: Record<string, unknown> | null;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
