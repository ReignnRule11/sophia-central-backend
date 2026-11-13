import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountLifecycle2026111300001 implements MigrationInterface {
  name = 'AddAccountLifecycle2026111300001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "accountStatus" varchar(24) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "deletionRequestedAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "deletionScheduledAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "securityQuestionId" varchar(48) NULL,
        ADD COLUMN IF NOT EXISTS "securityAnswerHash" text NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_account_deletion_due"
      ON "users" ("deletionScheduledAt")
      WHERE "accountStatus" = 'pending_deletion'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_account_deletion_due"');
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "securityAnswerHash",
        DROP COLUMN IF EXISTS "securityQuestionId",
        DROP COLUMN IF EXISTS "deletionScheduledAt",
        DROP COLUMN IF EXISTS "deletionRequestedAt",
        DROP COLUMN IF EXISTS "accountStatus"
    `);
  }
}
