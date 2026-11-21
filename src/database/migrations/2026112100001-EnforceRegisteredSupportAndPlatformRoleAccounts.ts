import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceRegisteredSupportAndPlatformRoleAccounts2026112100001 implements MigrationInterface {
  name = 'EnforceRegisteredSupportAndPlatformRoleAccounts2026112100001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Never silently discard guest tickets if an earlier deployment accepted any.
    const guestRows = await queryRunner.query(
      'SELECT id FROM support_requests WHERE "userId" IS NULL LIMIT 1',
    );
    if (guestRows.length) {
      throw new Error(
        'Cannot enforce registered-only Support tickets while guest-owned rows exist. Review and migrate those rows before retrying.',
      );
    }

    await queryRunner.query('ALTER TABLE support_requests ALTER COLUMN "userId" SET NOT NULL');
    await queryRunner.query('DROP INDEX IF EXISTS idx_support_requests_sender_email');
    await queryRunner.query('DROP INDEX IF EXISTS idx_support_requests_verification_hash');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "emailVerificationExpiresAt"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "emailVerificationTokenHash"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "emailVerifiedAt"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderAccountType"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderDepartment"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderFaculty"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderInstitution"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderEmail"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderName"');

    await queryRunner.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS "platformRoleVerifiedAt" timestamptz');
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_single_moderator_role" ON users (role) WHERE role = \'moderator\'',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_single_support_role" ON users (role) WHERE role = \'support\'',
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS platform_role_audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "actorId" uuid REFERENCES users(id) ON DELETE SET NULL,
      "targetId" uuid REFERENCES users(id) ON DELETE SET NULL,
      role varchar(24) NOT NULL,
      action varchar(24) NOT NULL,
      "previousRole" varchar(24),
      "newRole" varchar(24) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_platform_role_audit_created" ON platform_role_audit_events ("createdAt" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_platform_role_audit_target" ON platform_role_audit_events ("targetId", "createdAt" DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_platform_role_audit_target"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_platform_role_audit_created"');
    await queryRunner.query('DROP TABLE IF EXISTS platform_role_audit_events');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_single_support_role"');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS "platformRoleVerifiedAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_single_moderator_role"');
    // Deliberately do not make Support userId nullable or recreate guest-ticket columns.
    // Rolling back must not re-enable the retired public guest-ticket workflow.
  }
}
