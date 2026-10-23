import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ResourceModerationStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged',
}

export enum ResourceType {
  LECTURE_NOTES = 'lecture_notes',
  PAST_QUESTION = 'past_question',
  RESEARCH_PAPER = 'research_paper',
  PROJECT = 'project',
  SLIDES = 'slides',
  OTHER = 'other',
}

@Entity({ name: 'resources' })
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: ResourceType, default: ResourceType.OTHER })
  type: ResourceType;

  @Column({ nullable: true })
  course?: string;

  @Column({ nullable: true })
  topic?: string;

  @Column({ nullable: true })
  institution?: string;

  @Column({ nullable: true })
  level?: string;

  @Column({ nullable: true })
  fileUrl?: string;

  @Column({ type: 'enum', enum: ResourceModerationStatus, default: ResourceModerationStatus.PENDING })
  moderationStatus: ResourceModerationStatus;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: 0 })
  views: number;

  @Column({ default: 0 })
  downloads: number;

  @Column()
  uploaderId: string;

  @ManyToOne(() => User, (user) => user.resources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaderId' })
  uploader: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
