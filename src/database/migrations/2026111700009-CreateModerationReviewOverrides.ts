import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateModerationReviewOverrides2026111700009 implements MigrationInterface {
  name = 'CreateModerationReviewOverrides2026111700009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moderation_review_overrides" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resourceId" uuid NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
        "actorId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "originalReviewerId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "originalStatus" varchar(24) NOT NULL,
        "newStatus" varchar(24) NOT NULL CHECK ("newStatus" IN ('approved', 'rejected', 'revision_requested')),
        "reason" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_moderation_review_overrides_resource_created" ON "moderation_review_overrides" ("resourceId", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_moderation_review_overrides_immutable"
      BEFORE UPDATE OR DELETE ON "moderation_review_overrides"
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "moderation_review_overrides"`);
  }
}
