import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_payout_reconciliation_runs' })
export class PaymentPayoutReconciliationRun {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ type: 'timestamptz' }) periodStart!: Date;
  @Column({ type: 'timestamptz' }) periodEnd!: Date;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ type: 'integer', default: 0 }) providerTransfers!: number;
  @Column({ type: 'integer', default: 0 }) localPayouts!: number;
  @Column({ type: 'jsonb' }) discrepancies!: Record<string, unknown>[];
  @Column({ type: 'uuid' }) initiatedByUserId!: string;
  @CreateDateColumn() createdAt!: Date;
}