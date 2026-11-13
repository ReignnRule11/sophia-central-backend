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
import { Resource } from '../../resources/entities/resource.entity';
import { Institution } from '../../institutions/entities/institution.entity';

export enum UserRole {
  STUDENT = 'student',
  LECTURER = 'lecturer',
  REVIEWER = 'reviewer',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

export type AuthProvider =
  | 'email'
  | 'google'
  | 'apple'
  | 'twitter'
  | 'linkedin'
  | 'instagram';

export interface TeachingAssignment {
  courseName: string;
  courseCode?: string;
  levels: string[];
}

export interface UserSocialLinks {
  linkedin?: string;
  instagram?: string;
  twitter?: string;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  uniqueId!: string;

  @Column({ type: 'uuid', nullable: true })
  institutionId?: string | null;

  @ManyToOne(() => Institution, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'institutionId' })
  institutionRecord?: Institution | null;

  @Column({ unique: true, type: 'varchar', length: 320 })
  email!: string;

  @Column({ nullable: true, select: false })
  password?: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  academicHandle?: string;

  @Column({ nullable: true })
  socialHandle?: string;

  @Column({ type: 'jsonb', nullable: true })
  socialLinks?: UserSocialLinks;

  @Column({ nullable: true })
  profileImage?: string;

  @Column({ type: 'varchar', default: UserRole.STUDENT })
  role!: UserRole;

  @Column({ type: 'jsonb', nullable: true })
  reviewerExpertise?: string[];

  @Column({ type: 'varchar', length: 16, nullable: true })
  reviewerBaseRole?: 'student' | 'lecturer';

  @Column({ type: 'varchar', default: 'email' })
  authProvider!: AuthProvider;

  @Column({ nullable: true })
  institution?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  faculty?: string;

  @Column({ nullable: true })
  programme?: string;

  @Column({ type: 'jsonb', nullable: true })
  coursesTaught?: string[];

  @Column({ type: 'jsonb', nullable: true })
  teachingAssignments?: TeachingAssignment[];

  @Column({ nullable: true })
  studyLevel?: string;

  @Column({ nullable: true, type: 'text' })
  bio?: string;

  @Column({ default: false })
  isVerified!: boolean;

  @Column({ default: false })
  emailVerified!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ default: false })
  isSuspended!: boolean;

  @Column({ type: 'text', nullable: true })
  suspensionReason?: string;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  accountStatus!: 'active' | 'deactivated' | 'pending_deletion';

  @Column({ type: 'timestamptz', nullable: true })
  deletionRequestedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletionScheduledAt?: Date;

  @Column({ type: 'varchar', length: 48, nullable: true })
  securityQuestionId?: string;

  @Column({ type: 'text', nullable: true, select: false })
  securityAnswerHash?: string;

  @Column({ default: false })
  isProfileComplete!: boolean;

  @OneToMany(() => Resource, (resource) => resource.uploader)
  resources!: Resource[];

  @OneToMany(() => Resource, (resource) => resource.assignedReviewer)
  assignedReviews!: Resource[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
