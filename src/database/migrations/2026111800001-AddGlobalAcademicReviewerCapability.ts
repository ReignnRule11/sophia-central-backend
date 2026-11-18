import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalAcademicReviewerCapability2026111800001 implements MigrationInterface {
  name = 'AddGlobalAcademicReviewerCapability2026111800001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isGlobalReviewer" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_global_reviewer_active" ON "users" ("isGlobalReviewer", "isSuspended", "accountStatus") WHERE "isGlobalReviewer" = true`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_global_reviewer_active"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "isGlobalReviewer"`);
  }
}
