import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicGuestSupportTickets2026111900003 implements MigrationInterface {
  name = 'AddPublicGuestSupportTickets2026111900003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE support_requests ALTER COLUMN "userId" DROP NOT NULL');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderName" varchar(120)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderEmail" varchar(320)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderInstitution" varchar(180)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderFaculty" varchar(180)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderDepartment" varchar(180)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderAccountType" varchar(24)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "emailVerifiedAt" timestamptz');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "emailVerificationTokenHash" varchar(64)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" timestamptz');
    await queryRunner.query(`
      UPDATE support_requests AS request
      SET
        "senderName" = COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', account."firstName", account."lastName")), ''), account.email),
        "senderEmail" = account.email,
        "senderInstitution" = account.institution,
        "senderFaculty" = account.faculty,
        "senderDepartment" = account.department,
        "senderAccountType" = account.role,
        "emailVerifiedAt" = COALESCE(request."emailVerifiedAt", request."createdAt")
      FROM users AS account
      WHERE request."userId" = account.id
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_support_requests_verification_hash ON support_requests ("emailVerificationTokenHash") WHERE "emailVerificationTokenHash" IS NOT NULL');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_support_requests_sender_email ON support_requests ("senderEmail", "createdAt" DESC)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const guestRows = await queryRunner.query('SELECT 1 FROM support_requests WHERE "userId" IS NULL LIMIT 1');
    if (guestRows.length) throw new Error('Cannot roll back public support tickets while guest tickets exist.');
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
    await queryRunner.query('ALTER TABLE support_requests ALTER COLUMN "userId" SET NOT NULL');
  }
}
