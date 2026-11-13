import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('pending_registrations')
@Index('UQ_pending_registrations_email', ['email'], { unique: true })
@Index('IDX_pending_registrations_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_pending_registrations_expires_at', ['expiresAt'])
export class PendingRegistration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  // Profile data only. A password is deliberately never stored before mailbox ownership is proven.
  @Column({ type: 'jsonb' })
  registrationData!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  referralCode?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
