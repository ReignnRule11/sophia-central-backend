import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerCapability1794873600000 implements MigrationInterface {
  name = 'AddReviewerCapability1794873600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The entity models role as varchar, but older fresh-schema migrations
    // created a PostgreSQL enum that omitted the reviewer value. Normalize the
    // column to the entity's string representation before reviewer accounts
    // or future account types need to be persisted.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar(32) USING "role"::text`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'student'`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hasReviewerAccess" boolean NOT NULL DEFAULT false`);
    // Older production schemas may not have received the reviewerBaseRole
    // property even though the current entity and service already depend on it.
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reviewerBaseRole" varchar(16) NULL`);

    // Restore the underlying academic account type for legacy users whose
    // old REVIEWER role replaced their student/lecturer role. External
    // reviewer-only accounts remain REVIEWER identities.
    await queryRunner.query(`
      UPDATE "users"
      SET "role" = "reviewerBaseRole", "hasReviewerAccess" = true
      WHERE "role"::text = 'reviewer'
        AND "reviewerBaseRole" IN ('student', 'lecturer')
    `);
    await queryRunner.query(`
      UPDATE "users"
      SET "hasReviewerAccess" = true
      WHERE "role"::text = 'reviewer'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reconstruct the previous single-role representation for rollback.
    await queryRunner.query(`
      UPDATE "users"
      SET "reviewerBaseRole" = "role", "role" = 'reviewer'
      WHERE "hasReviewerAccess" = true
        AND "role" IN ('student', 'lecturer')
    `);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "hasReviewerAccess"`);
  }
}
