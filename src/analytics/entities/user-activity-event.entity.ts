import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'user_activity_events' })
export class UserActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  eventType!: 'search' | 'view' | 'download' | 'study' | 'upload';

  @Column({ type: 'uuid', nullable: true })
  institutionId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  resourceId?: string | null;

  @Column({ type: 'text', nullable: true })
  query?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
