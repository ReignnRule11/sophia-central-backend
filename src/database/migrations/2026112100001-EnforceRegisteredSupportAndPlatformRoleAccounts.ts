import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceRegisteredSupportAndPlatformRoleAccounts2026112100001 implements MigrationInterface {
  name = 'EnforceRegisteredSupportAndPlatformRoleAccounts2026112100001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Preserve every previously accepted guest ticket as legacy history before
    // enforcing the registered-account-only Support workflow. The archive has
    // no user foreign key, so it survives account lifecycle operations.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_request_guest_archive
      (LIKE support_requests INCLUDING DEFAULTS)
    `);
    await queryRunner.query(`
      ALTER TABLE support_request_guest_archive
      ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE support_request_guest_archive
      ADD COLUMN IF NOT EXISTS "archiveReason" text NOT NULL
      DEFAULT 'Guest-owned Support ticket retained as legacy history after guest ticket submission was retired.'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_support_request_guest_archive_id"
      ON support_request_guest_archive ("id")
    `);

    // Build the source-column list from the live table so the archive remains
    // compatible with optional legacy columns added by earlier deployments.
    // ON CONFLICT makes the copy safe to retry if an archive row already exists.
    await queryRunner.query(`
      DO $archive$
      DECLARE source_columns text;
      BEGIN
        SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
        INTO source_columns
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'support_requests';

        IF source_columns IS NULL THEN
          RAISE EXCEPTION 'Cannot archive legacy guest Support tickets: support_requests columns were not found.';
        END IF;

        EXECUTE format(
          'INSERT INTO support_request_guest_archive (%1$s)
           SELECT %1$s
           FROM support_requests
           WHERE "userId" IS NULL
           ON CONFLICT ("id") DO NOTHING',
          source_columns
        );
      END
      $archive$;
    `);

    // Guest verification tokens are no longer usable and must not be retained.
    await queryRunner.query(`
      UPDATE support_request_guest_archive
      SET "emailVerificationTokenHash" = NULL,
          "emailVerificationExpiresAt" = NULL
      WHERE "emailVerificationTokenHash" IS NOT NULL
         OR "emailVerificationExpiresAt" IS NOT NULL
    `);

    // Fail closed if any source row was not successfully preserved.
    const unarchivedRows = await queryRunner.query(`
      SELECT request.id
      FROM support_requests AS request
      LEFT JOIN support_request_guest_archive AS archived
        ON archived.id = request.id
      WHERE request."userId" IS NULL
        AND archived.id IS NULL
      LIMIT 1
    `);
    if (unarchivedRows.length) {
      throw new Error('Legacy guest Support ticket archival was incomplete; refusing to remove source records.');
    }

    // Only the archived guest rows are removed from the active ticket queue.
    await queryRunner.query(`
      DELETE FROM support_requests AS request
      USING support_request_guest_archive AS archived
      WHERE request.id = archived.id
        AND request."userId" IS NULL
    `);

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
    // The legacy guest archive is intentionally retained during rollback.
    // Rolling back must not re-enable guest ticket submission or discard history.
  }
}
