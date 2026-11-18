import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewerApplicationDecisionAudit2026111700002 implements MigrationInterface {
  name = 'CreateReviewerApplicationDecisionAudit2026111700002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviewer_application_decisions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL,
        "actorId" uuid,
        "fromStatus" varchar(24) NOT NULL,
        "toStatus" varchar(24) NOT NULL,
        "note" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_application_decisions_application_created" ON "reviewer_application_decisions" ("applicationId", "createdAt")`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_immutable_audit_mutation() RETURNS trigger AS $audit$
      BEGIN
        RAISE EXCEPTION 'Audit records are append-only and cannot be updated or deleted';
      END;
      $audit$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_reviewer_application_decisions_immutable"
      BEFORE UPDATE OR DELETE ON "reviewer_application_decisions"
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_reviewer_application_decisions_immutable" ON "reviewer_application_decisions"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_immutable_audit_mutation()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviewer_application_decisions_application_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviewer_application_decisions"`);
  }
}
