import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type ReferralRewardStatus = 'pending' | 'awarded' | 'under_review' | 'rejected';

@Entity({ name: 'referrals' })
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  referrerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrerId' })
  referrer!: User;

  @Column({ type: 'uuid', nullable: true })
  referredUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'referredUserId' })
  referredUser?: User | null;

  @Column({ type: 'int', default: 0 })
  rewardAmount!: number;

  @Column({ type: 'int', default: 0 })
  rewardRemaining!: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  rewardStatus!: ReferralRewardStatus;

  @Column({ type: 'timestamp', nullable: true })
  rewardAwardedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewReason?: string | null;

  // The same code is reused by redemption-event rows; only owner records are unique.
  @Column()
  code!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isCodeOwnerRecord!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  redeemedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
