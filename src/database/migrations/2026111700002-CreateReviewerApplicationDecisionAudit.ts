import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewerApplicationDecisionAudit2026111700002 implements MigrationInterface {
  name = 'CreateReviewerApplicationDecisionAudit2026111700002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviewer_application_decisions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL REFERENCES "reviewer_applications"("id") ON DELETE CASCADE,
        "actorId" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "fromStatus" varchar(24) NOT NULL,
        "toStatus" varchar(24) NOT NULL,
        "note" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_application_decisions_application_created" ON "reviewer_application_decisions" ("applicationId", "createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviewer_application_decisions_application_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviewer_application_decisions"`);
  }
}
