import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum ResourceRewardStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

@Entity({ name: 'resource_reward_outbox' })
@Index('UQ_resource_reward_outbox_resource', ['resourceId'], { unique: true })
@Index('IDX_resource_reward_outbox_pending', ['status', 'nextAttemptAt'])
export class ResourceRewardOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  resourceId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16, default: ResourceRewardStatus.PENDING })
  status!: ResourceRewardStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  nextAttemptAt!: Date;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
