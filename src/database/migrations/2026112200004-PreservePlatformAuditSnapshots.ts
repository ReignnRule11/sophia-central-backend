import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreservePlatformAuditSnapshots2026112200004 implements MigrationInterface {
  name = 'PreservePlatformAuditSnapshots2026112200004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE platform_role_audit_events
      ADD COLUMN IF NOT EXISTS "actorEmail" varchar(320),
      ADD COLUMN IF NOT EXISTS "targetEmail" varchar(320)
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "TRG_platform_role_audit_events_immutable" ON platform_role_audit_events
    `);
    await queryRunner.query(`
      UPDATE platform_role_audit_events event
      SET "actorEmail" = COALESCE(event."actorEmail", actor.email),
          "targetEmail" = COALESCE(event."targetEmail", target.email)
      FROM users actor, users target
      WHERE actor.id = event."actorId" AND target.id = event."targetId"
    `);
    await queryRunner.query(`
      DO $drop_fks$
      DECLARE constraint_row record;
      BEGIN
        FOR constraint_row IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'platform_role_audit_events'::regclass
            AND contype = 'f'
        LOOP
          EXECUTE format('ALTER TABLE platform_role_audit_events DROP CONSTRAINT %I', constraint_row.conname);
        END LOOP;
      END;
      $drop_fks$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_platform_role_audit_events_immutable"
      BEFORE UPDATE OR DELETE ON platform_role_audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_audit_mutation()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // The original foreign-key relationships are intentionally not restored:
    // immutable audit history must not prevent account deletion or anonymization.
    await queryRunner.query(`
      ALTER TABLE platform_role_audit_events
      DROP COLUMN IF EXISTS "actorEmail",
      DROP COLUMN IF EXISTS "targetEmail"
    `);
  }
}
