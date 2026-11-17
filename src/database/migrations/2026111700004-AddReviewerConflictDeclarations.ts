import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerConflictDeclarations2026111700004 implements MigrationInterface {
  name = 'AddReviewerConflictDeclarations2026111700004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "reviewAssignmentId" uuid`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviewer_conflict_declarations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "assignmentId" uuid NOT NULL,
        "resourceId" uuid NOT NULL,
        "reviewerId" uuid NOT NULL,
        "declaration" varchar(16) NOT NULL CHECK ("declaration" IN ('no_conflict', 'recuse')),
        "reason" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_conflict_declarations_assignment_created" ON "reviewer_conflict_declarations" ("assignmentId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_conflict_declarations_resource" ON "reviewer_conflict_declarations" ("resourceId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_conflict_declarations_reviewer" ON "reviewer_conflict_declarations" ("reviewerId", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_reviewer_conflict_declarations_immutable"
      BEFORE UPDATE OR DELETE ON "reviewer_conflict_declarations"
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reviewer_conflict_declarations"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN IF EXISTS "reviewAssignmentId"`);
  }
}
