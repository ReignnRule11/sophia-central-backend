import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerApprovedScope2026111700006 implements MigrationInterface {
  name = 'AddReviewerApprovedScope2026111700006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reviewerAcademicLevels" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "reviewer_applications" ADD COLUMN IF NOT EXISTS "approvedExpertiseAreas" jsonb`);
    await queryRunner.query(`ALTER TABLE "reviewer_applications" ADD COLUMN IF NOT EXISTS "approvedAcademicLevels" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviewer_applications" DROP COLUMN IF EXISTS "approvedAcademicLevels"`);
    await queryRunner.query(`ALTER TABLE "reviewer_applications" DROP COLUMN IF EXISTS "approvedExpertiseAreas"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "reviewerAcademicLevels"`);
  }
}
