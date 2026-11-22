import { MigrationInterface, QueryRunner } from 'typeorm';

export class PersistAdminEscalationRecords2026112200003 implements MigrationInterface {
  name = 'PersistAdminEscalationRecords2026112200003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE support_requests
      ADD COLUMN IF NOT EXISTS "escalationReason" text,
      ADD COLUMN IF NOT EXISTS "escalatedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "escalatedById" uuid REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      UPDATE support_requests
      SET "escalatedAt" = COALESCE("escalatedAt", "updatedAt"),
          "escalationReason" = COALESCE("escalationReason", 'Historical escalation; the reason was not retained by the previous workflow.')
      WHERE "escalatedToRole" = 'admin'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_requests_admin_escalations"
      ON support_requests ("escalatedAt" DESC)
      WHERE "escalatedToRole" = 'admin'
    `);

    await queryRunner.query(`
      ALTER TABLE content_reports
      ADD COLUMN IF NOT EXISTS "escalatedToRole" varchar(24),
      ADD COLUMN IF NOT EXISTS "escalationReason" text,
      ADD COLUMN IF NOT EXISTS "escalatedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "escalatedById" uuid REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE content_reports
      DROP CONSTRAINT IF EXISTS "CHK_content_reports_escalated_to_admin"
    `);
    await queryRunner.query(`
      ALTER TABLE content_reports
      ADD CONSTRAINT "CHK_content_reports_escalated_to_admin"
      CHECK ("escalatedToRole" IS NULL OR "escalatedToRole" = 'admin')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_reports_admin_escalations"
      ON content_reports ("escalatedAt" DESC)
      WHERE "escalatedToRole" = 'admin'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_escalation_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(24) NOT NULL CHECK ("sourceType" IN ('support', 'moderation')),
        "sourceId" uuid NOT NULL,
        "ticketNumber" varchar(32) NOT NULL,
        "actorId" uuid,
        "actorEmail" varchar(320),
        reason text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_escalation_events_created"
      ON admin_escalation_events ("createdAt" DESC)
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_admin_escalation_events_immutable" ON admin_escalation_events
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_admin_escalation_events_immutable"
      BEFORE UPDATE OR DELETE ON admin_escalation_events
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_admin_escalation_events_immutable" ON admin_escalation_events`);
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_admin_escalation_events_created"');
    await queryRunner.query('DROP TABLE IF EXISTS admin_escalation_events');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_content_reports_admin_escalations"');
    await queryRunner.query('ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS "CHK_content_reports_escalated_to_admin"');
    await queryRunner.query(`
      ALTER TABLE content_reports
      DROP COLUMN IF EXISTS "escalatedById",
      DROP COLUMN IF EXISTS "escalatedAt",
      DROP COLUMN IF EXISTS "escalationReason",
      DROP COLUMN IF EXISTS "escalatedToRole"
    `);
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_support_requests_admin_escalations"');
    await queryRunner.query(`
      ALTER TABLE support_requests
      DROP COLUMN IF EXISTS "escalatedById",
      DROP COLUMN IF EXISTS "escalatedAt",
      DROP COLUMN IF EXISTS "escalationReason"
    `);
  }
}
