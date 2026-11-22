import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminMfa2026112200006 implements MigrationInterface {
  name = 'AddAdminMfa2026112200006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "adminMfaEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "adminMfaSecretEncrypted" text,
      ADD COLUMN IF NOT EXISTS "adminMfaRecoveryCodeHashes" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE users
      ADD CONSTRAINT "CHK_admin_mfa_only_admin" CHECK (
        "adminMfaEnabled" = false OR role = 'admin'
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "CHK_admin_mfa_only_admin"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "adminMfaRecoveryCodeHashes"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "adminMfaSecretEncrypted"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "adminMfaEnabled"`);
  }
}
