import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_reconciliation_runs' })
export class PaymentReconciliationRun {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ type: 'timestamptz' }) periodStart!: Date;
  @Column({ type: 'timestamptz' }) periodEnd!: Date;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ type: 'integer', default: 0 }) providerTransactions!: number;
  @Column({ type: 'integer', default: 0 }) localPayments!: number;
  @Column({ type: 'integer', default: 0 }) providerRefunds!: number;
  @Column({ type: 'integer', default: 0 }) localRefunds!: number;
  @Column({ type: 'jsonb' }) discrepancies!: Record<string, unknown>[];
  @Column({ type: 'uuid' }) initiatedByUserId!: string;
  @CreateDateColumn() createdAt!: Date;
}
