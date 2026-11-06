import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('email_verification_tokens')
@Index('IDX_email_verification_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_email_verification_tokens_user_id', ['userId'])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  referralCode?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
