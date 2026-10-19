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
import { AiMessage } from './ai-message.entity';

@Entity({ name: 'ai_sessions' })
export class AiSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  resourceId?: string;

  @ManyToOne(() => Resource, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resourceId' })
  resource?: Resource;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => AiMessage, (message) => message.session, { cascade: true })
  messages: AiMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
