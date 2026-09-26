import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Resource, ResourceModerationStatus } from '../../resources/entities/resource.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'moderation_reviews' })
export class ModerationReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource: Resource;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewerId' })
  reviewer: User;

  @Column({ type: 'enum', enum: ResourceModerationStatus })
  status: ResourceModerationStatus;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt: Date;
}
