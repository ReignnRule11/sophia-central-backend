import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'point_transactions' })
export class PointTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ['earned', 'spent', 'bonus'], default: 'earned' })
  type: 'earned' | 'spent' | 'bonus';

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @CreateDateColumn()
  createdAt: Date;
}
