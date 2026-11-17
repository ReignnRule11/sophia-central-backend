import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerCapability1794873600000 implements MigrationInterface {
  name = 'AddReviewerCapability1794873600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hasReviewerAccess" boolean NOT NULL DEFAULT false`);

    // Preserve the original academic account type for users whose old REVIEWER
    // role replaced their student/lecturer role. External reviewers remain
    // REVIEWER-only identities but receive the independent capability.
    await queryRunner.query(`
      UPDATE "users"
      SET "role" = "reviewerBaseRole", "hasReviewerAccess" = true
      WHERE "role" = 'reviewer'
        AND "reviewerBaseRole" IN ('student', 'lecturer')
    `);
    await queryRunner.query(`
      UPDATE "users"
      SET "hasReviewerAccess" = true
      WHERE "role" = 'reviewer'
        AND ("reviewerBaseRole" IS NULL OR "reviewerBaseRole" NOT IN ('student', 'lecturer'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the legacy single-role representation before removing the
    // capability column. This is a rollback path, not a routine operation.
    await queryRunner.query(`
      UPDATE "users"
      SET "reviewerBaseRole" = "role", "role" = 'reviewer'
      WHERE "hasReviewerAccess" = true
        AND "role" IN ('student', 'lecturer')
    `);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "hasReviewerAccess"`);
  }
}
