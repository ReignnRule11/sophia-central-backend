import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminEscalationDecisions2026112200006 implements MigrationInterface {
  name = 'AddAdminEscalationDecisions2026112200006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_escalation_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sourceType" varchar(24) NOT NULL CHECK ("sourceType" IN ('support', 'moderation')),
        "sourceId" uuid NOT NULL,
        "ticketNumber" varchar(32) NOT NULL,
        action varchar(32) NOT NULL CHECK (action IN ('under_review', 'awaiting_information', 'returned_to_team', 'resolved')),
        note text NOT NULL,
        "actorId" uuid REFERENCES users(id) ON DELETE SET NULL,
        "actorEmail" varchar(320),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_escalation_decisions_latest"
      ON admin_escalation_decisions ("sourceType", "sourceId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_admin_escalation_decisions_immutable" ON admin_escalation_decisions
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_admin_escalation_decisions_immutable"
      BEFORE UPDATE OR DELETE ON admin_escalation_decisions
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS "TRG_admin_escalation_decisions_immutable" ON admin_escalation_decisions');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_admin_escalation_decisions_latest"');
    await queryRunner.query('DROP TABLE IF EXISTS admin_escalation_decisions');
  }
}
