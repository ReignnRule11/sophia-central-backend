import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportCaseManagement2026112400001 implements MigrationInterface {
  name = 'SupportCaseManagement2026112400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE support_requests
      ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS "assignedSupportId" uuid NULL,
      ADD COLUMN IF NOT EXISTS "slaDueAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "resolvedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "closedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "resolutionCategory" varchar(60) NULL,
      ADD COLUMN IF NOT EXISTS "closureReason" text NULL`);
    await queryRunner.query(`ALTER TABLE support_requests ADD CONSTRAINT "FK_support_requests_assigned_support"
      FOREIGN KEY ("assignedSupportId") REFERENCES users(id) ON DELETE SET NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_requests_priority" ON support_requests (priority)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_requests_assigned_support" ON support_requests ("assignedSupportId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_requests_sla_due" ON support_requests ("slaDueAt") WHERE status NOT IN ('resolved', 'closed', 'concluded')`);
    await queryRunner.query(`UPDATE support_requests SET "slaDueAt" = "createdAt" + interval '72 hours' WHERE "slaDueAt" IS NULL`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS support_request_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "supportRequestId" uuid NOT NULL REFERENCES support_requests(id) ON DELETE RESTRICT,
      "actorId" uuid NULL,
      "actorEmail" varchar(320) NOT NULL,
      "eventType" varchar(48) NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_request_events_ticket_created"
      ON support_request_events ("supportRequestId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS support_request_internal_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "supportRequestId" uuid NOT NULL REFERENCES support_requests(id) ON DELETE RESTRICT,
      "authorId" uuid NULL,
      "authorEmail" varchar(320) NOT NULL,
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_support_internal_notes_ticket_created"
      ON support_request_internal_notes ("supportRequestId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION prevent_support_audit_mutation() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'Support audit records are append-only'; END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_request_events_immutable" ON support_request_events`);
    await queryRunner.query(`CREATE TRIGGER "TR_support_request_events_immutable"
      BEFORE UPDATE OR DELETE ON support_request_events FOR EACH ROW EXECUTE FUNCTION prevent_support_audit_mutation()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_internal_notes_immutable" ON support_request_internal_notes`);
    await queryRunner.query(`CREATE TRIGGER "TR_support_internal_notes_immutable"
      BEFORE UPDATE OR DELETE ON support_request_internal_notes FOR EACH ROW EXECUTE FUNCTION prevent_support_audit_mutation()`);
    await queryRunner.query(`INSERT INTO support_request_events ("supportRequestId", "actorEmail", "eventType", details, "createdAt")
      SELECT id, 'system@sophiscentral.local', 'ticket_created', jsonb_build_object('status', status), "createdAt"
      FROM support_requests ON CONFLICT DO NOTHING`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION set_support_request_sla_due() RETURNS trigger AS $$
      BEGIN
        IF NEW."slaDueAt" IS NULL OR (TG_OP = 'UPDATE' AND NEW.priority IS DISTINCT FROM OLD.priority) THEN
          NEW."slaDueAt" := COALESCE(NEW."createdAt", now()) + CASE NEW.priority
            WHEN 'urgent' THEN interval '4 hours'
            WHEN 'high' THEN interval '24 hours'
            WHEN 'low' THEN interval '120 hours'
            ELSE interval '72 hours'
          END;
        END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_request_sla_due" ON support_requests`);
    await queryRunner.query(`CREATE TRIGGER "TR_support_request_sla_due"
      BEFORE INSERT OR UPDATE OF priority, "slaDueAt" ON support_requests
      FOR EACH ROW EXECUTE FUNCTION set_support_request_sla_due()`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION record_support_ticket_created() RETURNS trigger AS $$
      BEGIN
        INSERT INTO support_request_events ("supportRequestId", "actorEmail", "eventType", details)
        VALUES (NEW.id, 'system@sophiscentral.local', 'ticket_created', jsonb_build_object('status', NEW.status));
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_ticket_created_event" ON support_requests`);
    await queryRunner.query(`CREATE TRIGGER "TR_support_ticket_created_event"
      AFTER INSERT ON support_requests FOR EACH ROW EXECUTE FUNCTION record_support_ticket_created()`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION record_support_ticket_changes() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO support_request_events ("supportRequestId", "actorEmail", "eventType", details)
          VALUES (NEW.id, 'system@sophiscentral.local', 'status_changed', jsonb_build_object('from', OLD.status, 'to', NEW.status));
        END IF;
        IF OLD."escalatedToRole" IS DISTINCT FROM NEW."escalatedToRole" THEN
          INSERT INTO support_request_events ("supportRequestId", "actorEmail", "eventType", details)
          VALUES (NEW.id, 'system@sophiscentral.local', 'escalation_changed', jsonb_build_object('from', OLD."escalatedToRole", 'to', NEW."escalatedToRole"));
        END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TR_support_ticket_change_events" AFTER UPDATE OF status, "escalatedToRole" ON support_requests FOR EACH ROW EXECUTE FUNCTION record_support_ticket_changes()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_ticket_change_events" ON support_requests`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS record_support_ticket_changes()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_ticket_created_event" ON support_requests`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS record_support_ticket_created()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TR_support_request_sla_due" ON support_requests`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_support_request_sla_due()`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_request_internal_notes`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_request_events`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_support_audit_mutation()`);
    await queryRunner.query(`ALTER TABLE support_requests DROP CONSTRAINT IF EXISTS "FK_support_requests_assigned_support"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_requests_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_requests_assigned_support"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_requests_sla_due"`);
    await queryRunner.query(`ALTER TABLE support_requests
      DROP COLUMN IF EXISTS "closureReason",
      DROP COLUMN IF EXISTS "resolutionCategory",
      DROP COLUMN IF EXISTS "closedAt",
      DROP COLUMN IF EXISTS "resolvedAt",
      DROP COLUMN IF EXISTS "slaDueAt",
      DROP COLUMN IF EXISTS "assignedSupportId",
      DROP COLUMN IF EXISTS priority`);
  }
}
