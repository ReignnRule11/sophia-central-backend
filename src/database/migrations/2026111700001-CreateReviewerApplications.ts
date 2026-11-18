import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewerApplications2026111700001 implements MigrationInterface {
  name = 'CreateReviewerApplications2026111700001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reviewerStatus" varchar(32) NOT NULL DEFAULT 'not_applied'`);
    await queryRunner.query(`UPDATE "users" SET "reviewerStatus" = 'approved' WHERE "hasReviewerAccess" = true`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviewer_applications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" varchar(24) NOT NULL DEFAULT 'submitted',
        "qualifications" jsonb NOT NULL,
        "expertiseAreas" jsonb NOT NULL,
        "institution" varchar(160),
        "faculty" varchar(160),
        "department" varchar(160),
        "academicLevels" jsonb NOT NULL,
        "reviewExperience" text NOT NULL,
        "supportingDocuments" jsonb,
        "conflictDeclaration" text NOT NULL,
        "policyAccepted" boolean NOT NULL DEFAULT false,
        "decidedById" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "decisionNote" text,
        "decidedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_applications_user_created" ON "reviewer_applications" ("userId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviewer_applications_status_created" ON "reviewer_applications" ("status", "createdAt")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_reviewer_applications_one_active_per_user" ON "reviewer_applications" ("userId") WHERE "status" IN ('submitted', 'under_review')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reviewer_applications"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "reviewerStatus"`);
  }
}
