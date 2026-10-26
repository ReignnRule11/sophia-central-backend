import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resource } from '../../resources/entities/resource.entity';

@Entity({ name: 'file_uploads' })
export class FileUpload {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  uploadId!: string;

  @Column()
  resourceId!: string;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @Column()
  userId!: string;

  @Column()
  filename!: string;

  @Column()
  mimetype!: string;

  @Column({ type: 'bigint' })
  size!: number;

  @Column()
  s3Key!: string;

  @Column({ type: 'enum', enum: ['pending', 'completed', 'failed', 'scanned'], default: 'pending' })
  status!: 'pending' | 'completed' | 'failed' | 'scanned';

  @Column({ type: 'text', nullable: true })
  scanResult?: string;

  @CreateDateColumn()
  uploadedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
