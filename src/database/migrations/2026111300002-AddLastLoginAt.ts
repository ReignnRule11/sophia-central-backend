import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastLoginAt2026111300002 implements MigrationInterface {
  name = 'AddLastLoginAt2026111300002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "lastLoginAt" timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_last_login_at"
      ON "users" ("lastLoginAt" DESC)
      WHERE "lastLoginAt" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_last_login_at"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "lastLoginAt"');
  }
}
