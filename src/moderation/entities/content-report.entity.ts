import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ReportTargetType { USER = 'user', RESOURCE = 'resource', CHAT_MESSAGE = 'chat_message' }
export enum ReportReason { SPAM = 'spam', HARASSMENT = 'harassment', IMPERSONATION = 'impersonation', INAPPROPRIATE_CONTENT = 'inappropriate_content', MISINFORMATION = 'misinformation', COPYRIGHT = 'copyright', OTHER = 'other' }
export enum ContentReportStatus { PENDING = 'pending', REVIEWING = 'reviewing', ACTIONED = 'actioned', DISMISSED = 'dismissed' }

@Entity({ name: 'content_reports' })
export class ContentReport {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', nullable: true }) reporterId?: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporterId' }) reporter?: User | null;
  @Column({ type: 'enum', enum: ReportTargetType }) targetType!: ReportTargetType;
  @Column({ type: 'uuid' }) targetId!: string;
  @Column({ type: 'uuid', nullable: true }) targetOwnerId?: string | null;
  @Column({ type: 'varchar', length: 255 }) targetLabel!: string;
  @Column({ type: 'jsonb' }) targetSnapshot!: Record<string, unknown>;
  @Column({ type: 'enum', enum: ReportReason }) reason!: ReportReason;
  @Column({ type: 'text', nullable: true }) details?: string | null;
  @Column({ type: 'enum', enum: ContentReportStatus, default: ContentReportStatus.PENDING }) status!: ContentReportStatus;
  @Column({ type: 'uuid', nullable: true }) assignedModeratorId?: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedModeratorId' }) assignedModerator?: User | null;
  @Column({ type: 'text', nullable: true }) moderatorNote?: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
