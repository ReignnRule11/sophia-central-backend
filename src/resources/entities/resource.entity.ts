import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ResourceModerationStatus { DRAFT='draft', PENDING='pending', REVISION_REQUESTED='revision_requested', APPROVED='approved', REJECTED='rejected', FLAGGED='flagged' }
export enum ResourceType { LECTURE_NOTES='lecture_notes', PAST_QUESTION='past_question', RESEARCH_PAPER='research_paper', PROJECT='project', SLIDES='slides', OTHER='other' }
export enum ResourceLicense { CC_BY_4_0='CC-BY-4.0', CC_BY_SA_4_0='CC-BY-SA-4.0', CC0_1_0='CC0-1.0', ALL_RIGHTS_RESERVED='ALL-RIGHTS-RESERVED' }
export enum ResourcePricingMode { FREE='free', FIXED='fixed', CUSTOM='custom' }
export enum CustomPriceStatus { NOT_REQUIRED='not_required', PENDING='pending', APPROVED='approved', REJECTED='rejected' }

@Entity({ name: 'resources' })
export class Resource {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() title!: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ type: 'enum', enum: ResourceType, default: ResourceType.OTHER }) type!: ResourceType;
  @Column({ nullable: true }) course?: string;
  @Column({ nullable: true }) topic?: string;
  @Column({ nullable: true }) institution?: string;
  @Column({ nullable: true }) level?: string;
  @Column({ nullable: true }) fileUrl?: string;
  @Column({ default: false }) downloadRestricted!: boolean;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) tags!: string[];
  @Column({ type: 'enum', enum: ResourceModerationStatus, default: ResourceModerationStatus.PENDING }) moderationStatus!: ResourceModerationStatus;
  @Column({ default: false }) isVerified!: boolean;
  @Column({ type: 'enum', enum: ResourceLicense, nullable: true }) license?: ResourceLicense;
  @Column({ type: 'varchar', length: 300, nullable: true }) attribution?: string;
  @Column({ type: 'text', nullable: true }) sourceUrl?: string;
  @Column({ type: 'boolean', default: false }) rightsConfirmed!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) rightsConfirmedAt?: Date;
  @Column({ type: 'varchar', length: 16, default: ResourcePricingMode.FREE }) pricingMode!: ResourcePricingMode;
  @Column({ type: 'integer', nullable: true }) priceAmount?: number;
  @Column({ type: 'varchar', length: 16, default: CustomPriceStatus.NOT_REQUIRED }) customPriceStatus!: CustomPriceStatus;
  @Column({ type: 'uuid', nullable: true }) customPriceReviewedBy?: string;
  @Column({ type: 'timestamptz', nullable: true }) customPriceReviewedAt?: Date;
  @Column({ type: 'text', nullable: true }) customPriceReviewNote?: string;
  @Column({ type: 'timestamptz', default: () => 'NOW()' }) lastSubstantiveUpdateAt!: Date;
  @Column({ type: 'uuid', nullable: true }) assignedReviewerId?: string | null;
  @ManyToOne(() => User, (user) => user.assignedReviews, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedReviewerId' })
  assignedReviewer?: User;
  @Column({ default: 0 }) views!: number;
  @Column({ default: 0 }) downloads!: number;
  @Column() uploaderId!: string;
  @ManyToOne(() => User, (user) => user.resources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaderId' }) uploader!: User;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
