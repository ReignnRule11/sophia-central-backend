import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportCaseManagement2026112300002 implements MigrationInterface {
  name = 'AddReportCaseManagement2026112300002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "content_reports_severity_enum" AS ENUM ('low', 'normal', 'high', 'critical')`);
    await queryRunner.query(`ALTER TABLE content_reports ADD COLUMN "severity" "content_reports_severity_enum" NOT NULL DEFAULT 'normal'`);
    await queryRunner.query(`CREATE INDEX "IDX_content_reports_severity_status_created" ON content_reports ("severity", "status", "createdAt")`);
    await queryRunner.query(`
      CREATE TABLE report_case_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reportId" uuid NOT NULL REFERENCES content_reports(id) ON DELETE CASCADE,
        "actorId" uuid REFERENCES users(id) ON DELETE SET NULL,
        "actorEmail" varchar(320),
        "eventType" varchar(32) NOT NULL CHECK ("eventType" IN ('claimed', 'assigned', 'reassigned', 'severity_changed', 'status_changed', 'note_added', 'escalated_to_admin', 'returned_from_admin')),
        "fromModeratorId" uuid REFERENCES users(id) ON DELETE SET NULL,
        "toModeratorId" uuid REFERENCES users(id) ON DELETE SET NULL,
        "fromSeverity" varchar(24),
        "toSeverity" varchar(24),
        reason text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_report_case_events_report_created" ON report_case_events ("reportId", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_report_case_events_immutable"
      BEFORE UPDATE OR DELETE ON report_case_events
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_report_case_events_immutable" ON report_case_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS report_case_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_reports_severity_status_created"`);
    await queryRunner.query(`ALTER TABLE content_reports DROP COLUMN IF EXISTS "severity"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "content_reports_severity_enum"`);
  }
}
