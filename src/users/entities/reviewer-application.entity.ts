import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

export enum ReviewerApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  MORE_INFORMATION_REQUIRED = 'more_information_required',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

@Entity('reviewer_applications')
export class ReviewerApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 24, default: ReviewerApplicationStatus.SUBMITTED })
  status!: ReviewerApplicationStatus;

  @Column({ type: 'jsonb' })
  qualifications!: string[];

  @Column({ type: 'jsonb' })
  expertiseAreas!: string[];

  @Column({ type: 'varchar', length: 160, nullable: true })
  institution?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  faculty?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  department?: string | null;

  @Column({ type: 'jsonb' })
  academicLevels!: string[];

  @Column({ type: 'jsonb', nullable: true })
  approvedExpertiseAreas?: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  approvedAcademicLevels?: string[] | null;

  @Column({ type: 'text' })
  reviewExperience!: string;

  @Column({ type: 'jsonb', nullable: true })
  supportingDocuments?: string[];

  @Column({ type: 'text' })
  conflictDeclaration!: string;

  @Column({ type: 'boolean', default: false })
  policyAccepted!: boolean;

  @Column({ type: 'uuid', nullable: true })
  decidedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decidedById' })
  decidedBy?: User | null;

  @Column({ type: 'text', nullable: true })
  decisionNote?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
