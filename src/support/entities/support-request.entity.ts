import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'support_requests' })
export class SupportRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

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

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'concluded';

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
