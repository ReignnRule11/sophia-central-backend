import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PointTransactionType {
  EARNED = 'earned',
  SPENT = 'spent',
  BONUS = 'bonus',
}

@Entity({ name: 'point_transactions' })
export class PointTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: PointTransactionType, default: PointTransactionType.EARNED })
  type: PointTransactionType;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @CreateDateColumn()
  createdAt: Date;
}
