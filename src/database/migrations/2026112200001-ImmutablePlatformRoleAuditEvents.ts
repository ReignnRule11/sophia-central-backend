import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImmutablePlatformRoleAuditEvents2026112200001 implements MigrationInterface {
  name = 'ImmutablePlatformRoleAuditEvents2026112200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_immutable_audit_mutation() RETURNS trigger AS $audit$
      BEGIN
        RAISE EXCEPTION 'Audit records are append-only and cannot be updated or deleted';
      END;
      $audit$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_platform_role_audit_events_immutable" ON platform_role_audit_events
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_platform_role_audit_events_immutable"
      BEFORE UPDATE OR DELETE ON platform_role_audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Keep the shared immutable-audit function: reviewer decision history also uses it.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_platform_role_audit_events_immutable" ON platform_role_audit_events
    `);
  }
}
