import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum PaymentLedgerKind { PLATFORM_SHARE = 'platform_share', LECTURER_SHARE = 'lecturer_share' }

@Entity({ name: 'payment_ledger_entries' })
@Index('UQ_payment_ledger_payment_kind', ['paymentId', 'kind'], { unique: true })
export class PaymentLedgerEntry {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) paymentId!: string;
  @Column({ type: 'varchar', length: 24 }) kind!: PaymentLedgerKind;
  @Column({ type: 'uuid', nullable: true }) beneficiaryUserId!: string | null;
  @Column({ type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @CreateDateColumn() createdAt!: Date;
}
