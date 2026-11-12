import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContentReports2026111200002 implements MigrationInterface {
  name = 'CreateContentReports2026111200002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "content_reports_targettype_enum" AS ENUM ('user', 'resource', 'chat_message')`);
    await queryRunner.query(`CREATE TYPE "content_reports_reason_enum" AS ENUM ('spam', 'harassment', 'impersonation', 'inappropriate_content', 'misinformation', 'copyright', 'other')`);
    await queryRunner.query(`CREATE TYPE "content_reports_status_enum" AS ENUM ('pending', 'reviewing', 'actioned', 'dismissed')`);
    await queryRunner.query(`
      CREATE TABLE "content_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "reporterId" uuid,
        "targetType" "content_reports_targettype_enum" NOT NULL,
        "targetId" uuid NOT NULL,
        "targetOwnerId" uuid,
        "targetLabel" character varying(255) NOT NULL,
        "targetSnapshot" jsonb NOT NULL,
        "reason" "content_reports_reason_enum" NOT NULL,
        "details" text,
        "status" "content_reports_status_enum" NOT NULL DEFAULT 'pending',
        "assignedModeratorId" uuid,
        "moderatorNote" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_reports_reporter" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_content_reports_assigned_moderator" FOREIGN KEY ("assignedModeratorId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_content_reports_status_createdAt" ON "content_reports" ("status", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_content_reports_target" ON "content_reports" ("targetType", "targetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_content_reports_reporter" ON "content_reports" ("reporterId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "content_reports"`);
    await queryRunner.query(`DROP TYPE "content_reports_status_enum"`);
    await queryRunner.query(`DROP TYPE "content_reports_reason_enum"`);
    await queryRunner.query(`DROP TYPE "content_reports_targettype_enum"`);
  }
}
