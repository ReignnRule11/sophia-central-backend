import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'payment_payout_beneficiaries' })
export class PaymentPayoutBeneficiary {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', unique: true }) lecturerUserId!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ type: 'varchar', length: 64 }) recipientCode!: string;
  @Column({ type: 'varchar', length: 128 }) accountName!: string;
  @Column({ type: 'varchar', length: 64 }) bankName!: string;
  @Column({ type: 'varchar', length: 4 }) accountLast4!: string;
  @Column({ type: 'varchar', length: 3, default: 'NGN' }) currency!: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
