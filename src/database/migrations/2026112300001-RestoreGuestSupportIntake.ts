import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreGuestSupportIntake2026112300001 implements MigrationInterface {
  name = 'RestoreGuestSupportIntake2026112300001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE support_requests ALTER COLUMN "userId" DROP NOT NULL');
    await queryRunner.query('ALTER TABLE support_requests DROP CONSTRAINT IF EXISTS "FK_support_requests_user"');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderName" varchar(120)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderEmail" varchar(320)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "senderAccountType" varchar(24)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "requesterType" varchar(32) NOT NULL DEFAULT \'registered\'');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_support_requests_sender_email" ON support_requests ("senderEmail")');
    await queryRunner.query('ALTER TABLE support_requests ADD CONSTRAINT "FK_support_requests_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Guest ticket rows are retained. Rollback cannot safely restore userId NOT NULL
    // while guest records exist, so remove only the guest-specific schema.
    await queryRunner.query('ALTER TABLE support_requests DROP CONSTRAINT IF EXISTS "FK_support_requests_user"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_support_requests_sender_email"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "requesterType"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderAccountType"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderEmail"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "senderName"');
    await queryRunner.query('ALTER TABLE support_requests ADD CONSTRAINT "FK_support_requests_user" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL');
  }
}
