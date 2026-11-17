import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerCapability1794873600000 implements MigrationInterface {
  name = 'AddReviewerCapability1794873600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The entity models role as varchar, but older fresh-schema migrations
    // created a PostgreSQL enum that omitted the reviewer value. Normalize the
    // column to the entity's string representation before reviewer accounts
    // or future account types need to be persisted.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar(32) USING "role"::text`);
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
