import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'support_requests' })
export class SupportRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  ticketNumber!: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  senderName?: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  senderEmail?: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  senderAccountType?: 'guest' | 'student' | 'lecturer' | null;

  @Column({ type: 'varchar', length: 32, default: 'registered' })
  requesterType!: 'registered' | 'guest';

  @Column({ type: 'varchar', length: 180 })
  subject!: string;

  @Column({ type: 'varchar', length: 60 })
  category!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  links!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments!: string[];

  @Column({ type: 'varchar', length: 24, nullable: true })
  escalatedToRole?: 'moderator' | 'admin' | null;

  @Column({ type: 'text', nullable: true })
  escalationReason?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  escalatedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  escalatedById?: string | null;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status!: 'pending' | 'under_review' | 'reviewed' | 'response_sent' | 'concluded';

  @Column({ type: 'varchar', length: 16, default: 'normal' })
  priority!: 'low' | 'normal' | 'high' | 'urgent';

  @Column({ type: 'uuid', nullable: true })
  assignedSupportId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedSupportId' })
  assignedSupport?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  slaDueAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  resolutionCategory?: string | null;

  @Column({ type: 'text', nullable: true })
  closureReason?: string | null;

  @Column({ type: 'text', nullable: true })
  resolutionMessage?: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewerId' })
  reviewer?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  concludedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
