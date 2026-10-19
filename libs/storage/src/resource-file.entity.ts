import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('resource_files')
export class ResourceFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  resource_id: string;

  @Column('text')
  s3_key: string;

  @Column('text')
  filename: string;

  @Column({ type: 'text', nullable: true })
  content_type: string;

  @Column({ type: 'bigint', nullable: true })
  size: number;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @Column({ type: 'boolean', default: false })
  scan_passed: boolean;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
