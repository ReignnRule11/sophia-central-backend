import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds administrator-granted subject-matter reviewer access and explicit
 * reviewer assignment. Revision requests are a separate moderation outcome.
 */
export class AcademicQualityReviewWorkflow2026111200002 implements MigrationInterface {
  name = 'AcademicQualityReviewWorkflow2026111200002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "reviewerExpertise" jsonb`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "reviewerBaseRole" varchar(16)`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "assignedReviewerId" uuid`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_resources_assigned_reviewer'
        ) THEN
          ALTER TABLE resources
            ADD CONSTRAINT "FK_resources_assigned_reviewer"
            FOREIGN KEY ("assignedReviewerId") REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resources_assigned_reviewer_status" ON resources ("assignedReviewerId", "moderationStatus")`);

    // The resource moderation status is a PostgreSQL enum created by the
    // legacy resources migration; moderation review history has its own enum.
    await queryRunner.query(`ALTER TYPE "resources_moderationStatus_enum" ADD VALUE IF NOT EXISTS 'revision_requested'`);
    await queryRunner.query(`ALTER TYPE moderation_reviews_status_enum ADD VALUE IF NOT EXISTS 'revision_requested'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values safely inside a transactional
    // migration. Keep the additive enum labels while removing feature columns.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resources_assigned_reviewer_status"`);
    await queryRunner.query(`ALTER TABLE resources DROP CONSTRAINT IF EXISTS "FK_resources_assigned_reviewer"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "assignedReviewerId"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "reviewerBaseRole"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "reviewerExpertise"`);
  }
}
