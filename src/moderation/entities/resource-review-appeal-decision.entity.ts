import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('resource_review_appeal_decisions')
@Index(['appealId', 'createdAt'])
export class ResourceReviewAppealDecision {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) appealId!: string;
  @Column({ type: 'uuid' }) actorId!: string;
  @Column({ type: 'varchar', length: 24 }) fromStatus!: string;
  @Column({ type: 'varchar', length: 24 }) toStatus!: string;
  @Column({ type: 'text', nullable: true }) note?: string | null;
  @CreateDateColumn() createdAt!: Date;
}
