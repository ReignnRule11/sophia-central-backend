import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminMfaAuditEvents2026112200007 implements MigrationInterface {
  name = 'CreateAdminMfaAuditEvents2026112200007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_mfa_audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "targetId" uuid,
        email varchar(320) NOT NULL,
        action varchar(32) NOT NULL,
        method varchar(24),
        "actorEmail" varchar(320),
        reason text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_mfa_audit_created"
      ON admin_mfa_audit_events ("createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_admin_mfa_audit_mutation()
      RETURNS trigger AS $audit$
      BEGIN
        RAISE EXCEPTION 'Admin MFA audit events are immutable';
      END;
      $audit$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_admin_mfa_audit_events_immutable" ON admin_mfa_audit_events
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_admin_mfa_audit_events_immutable"
      BEFORE UPDATE OR DELETE ON admin_mfa_audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_admin_mfa_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_admin_mfa_audit_events_immutable" ON admin_mfa_audit_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_mfa_audit_events`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_admin_mfa_audit_mutation()`);
  }
}
