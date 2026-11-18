import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewerAssignmentEvents2026111700008 implements MigrationInterface {
  name = 'CreateReviewerAssignmentEvents2026111700008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviewer_assignment_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignmentId" uuid NOT NULL,
        "resourceId" uuid NOT NULL,
        "reviewerId" uuid NOT NULL,
        "actorId" uuid,
        "eventType" varchar(24) NOT NULL CHECK ("eventType" IN ('assigned', 'recused', 'completed', 'released')),
        "reviewStatus" varchar(24),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_assignment_events_assignment" ON "reviewer_assignment_events" ("assignmentId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_assignment_events_reviewer" ON "reviewer_assignment_events" ("reviewerId", "eventType", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_reviewer_assignment_events_immutable"
      BEFORE UPDATE OR DELETE ON "reviewer_assignment_events"
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reviewer_assignment_events"`);
  }
}
