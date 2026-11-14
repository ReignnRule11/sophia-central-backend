import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Registration profile data is encrypted at rest. The normalized academic
 * handle is retained separately so it can be reserved and checked efficiently.
 */
@Entity('registration_drafts')
export class RegistrationDraft {
  @PrimaryColumn({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  academicHandle!: string;

  @Column({ type: 'text' })
  encryptedPayload!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
