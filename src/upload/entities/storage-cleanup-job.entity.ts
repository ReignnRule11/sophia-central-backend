import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type StorageCleanupStatus = 'queued' | 'processing' | 'deleted' | 'protected' | 'failed';

@Entity({ name: 'storage_cleanup_jobs' })
@Index('idx_storage_cleanup_due', ['status', 'availableAt', 'createdAt'])
export class StorageCleanupJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  objectKey!: string;

  @Column({ type: 'varchar', length: 240 })
  reason!: string;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status!: StorageCleanupStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  availableAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
