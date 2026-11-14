import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Temporary credentials for verified users who have not completed onboarding.
 * Deliberately contains only the email and bcrypt password hash.
 */
@Entity('pre_accounts')
export class PreAccount {
  @PrimaryColumn({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  password!: string;
}
