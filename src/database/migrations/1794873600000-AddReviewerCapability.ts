import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerCapability1794873600000 implements MigrationInterface {
  name = 'AddReviewerCapability1794873600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hasReviewerAccess" boolean NOT NULL DEFAULT false`);

    // Preserve the legacy role representation during this backend-first
    // rollout so the currently deployed frontend keeps routing existing
    // reviewers correctly. The frontend migration will read reviewerBaseRole
    // as the legacy academic workspace until it is safe to normalize roles.
    await queryRunner.query(`
      UPDATE "users"
      SET "hasReviewerAccess" = true
      WHERE "role" = 'reviewer'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The migration intentionally leaves role/reviewerBaseRole unchanged.
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "hasReviewerAccess"`);
  }
}
