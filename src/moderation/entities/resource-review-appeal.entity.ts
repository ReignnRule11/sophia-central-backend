import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ResourceAppealStatus = 'submitted' | 'under_review' | 'accepted' | 'rejected';
export type ResourceAppealType = 'reconsideration' | 'favoritism_report';

@Entity('resource_review_appeals')
@Index(['resourceId', 'createdAt'])
export class ResourceReviewAppeal {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) resourceId!: string;
  @Column({ type: 'uuid' }) appellantId!: string;
  @Column({ type: 'uuid' }) originalReviewId!: string;
  @Column({ type: 'uuid' }) originalReviewerId!: string;
  @Column({ type: 'varchar', length: 24 }) appealType!: ResourceAppealType;
  @Column({ type: 'text' }) reason!: string;
  @Column({ type: 'varchar', length: 24, default: 'submitted' }) status!: ResourceAppealStatus;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
