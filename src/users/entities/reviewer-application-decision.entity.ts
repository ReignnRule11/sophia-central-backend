import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { ReviewerApplication, ReviewerApplicationStatus } from './reviewer-application.entity';

@Entity('reviewer_application_decisions')
export class ReviewerApplicationDecision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => ReviewerApplication, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'applicationId' })
  application!: ReviewerApplication;

  @Column({ type: 'uuid', nullable: true })
  actorId?: string | null;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'actorId' })
  actor?: User | null;

  @Column({ type: 'varchar', length: 24 })
  fromStatus!: ReviewerApplicationStatus;

  @Column({ type: 'varchar', length: 24 })
  toStatus!: ReviewerApplicationStatus;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
