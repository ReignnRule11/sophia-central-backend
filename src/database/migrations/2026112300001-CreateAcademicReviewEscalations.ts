import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAcademicReviewEscalations2026112300001 implements MigrationInterface {
  name = 'CreateAcademicReviewEscalations2026112300001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "academic_review_escalations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resourceId" uuid NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
        "requestedById" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "previousStatus" varchar(32) NOT NULL,
        "reason" text NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'resolved', 'withdrawn')),
        "resolvedById" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "resolutionNote" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "resolvedAt" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_review_escalations_resource" ON "academic_review_escalations" ("resourceId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_review_escalations_status" ON "academic_review_escalations" ("status", "createdAt" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "academic_review_escalations"`);
  }
}
