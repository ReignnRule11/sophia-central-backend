import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceReviewAppeals2026111700007 implements MigrationInterface {
  name = 'CreateResourceReviewAppeals2026111700007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resource_review_appeals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resourceId" uuid NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
        "appellantId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "originalReviewId" uuid NOT NULL REFERENCES "moderation_reviews"("id") ON DELETE RESTRICT,
        "originalReviewerId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "appealType" varchar(24) NOT NULL CHECK ("appealType" IN ('reconsideration', 'favoritism_report')),
        "reason" text NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'submitted' CHECK ("status" IN ('submitted', 'under_review', 'accepted', 'rejected')),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resource_review_appeals_resource_created" ON "resource_review_appeals" ("resourceId", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resource_review_appeal_decisions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "appealId" uuid NOT NULL REFERENCES "resource_review_appeals"("id") ON DELETE CASCADE,
        "actorId" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "fromStatus" varchar(24) NOT NULL,
        "toStatus" varchar(24) NOT NULL,
        "note" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resource_review_appeal_decisions_appeal_created" ON "resource_review_appeal_decisions" ("appealId", "createdAt")`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_resource_review_appeal_decisions_immutable"
      BEFORE UPDATE OR DELETE ON "resource_review_appeal_decisions"
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "resource_review_appeal_decisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "resource_review_appeals"`);
  }
}
