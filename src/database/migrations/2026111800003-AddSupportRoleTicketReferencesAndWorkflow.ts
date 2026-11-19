import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupportRoleTicketReferencesAndWorkflow2026111800003 implements MigrationInterface {
  name = 'AddSupportRoleTicketReferencesAndWorkflow2026111800003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SEQUENCE IF NOT EXISTS sophis_support_ticket_seq START WITH 1');
    await queryRunner.query('CREATE SEQUENCE IF NOT EXISTS sophis_report_ticket_seq START WITH 1');
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_single_support_role" ON users (role) WHERE role = 'support'`);

    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "ticketNumber" varchar(32)');
    await queryRunner.query('ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS "escalatedToRole" varchar(24)');
    await queryRunner.query(`UPDATE support_requests SET "ticketNumber" = 'SUP-' || EXTRACT(YEAR FROM "createdAt")::int::text || '-' || LPAD(nextval('sophis_support_ticket_seq')::text, 6, '0') WHERE "ticketNumber" IS NULL`);
    await queryRunner.query('ALTER TABLE support_requests ALTER COLUMN "ticketNumber" SET NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_support_requests_ticketNumber" ON support_requests ("ticketNumber")');
    await queryRunner.query(`UPDATE support_requests SET status = 'response_sent' WHERE status = 'concluded'`);

    await queryRunner.query('ALTER TABLE content_reports ADD COLUMN IF NOT EXISTS "ticketNumber" varchar(32)');
    await queryRunner.query(`UPDATE content_reports SET "ticketNumber" = 'RPT-' || EXTRACT(YEAR FROM "createdAt")::int::text || '-' || LPAD(nextval('sophis_report_ticket_seq')::text, 6, '0') WHERE "ticketNumber" IS NULL`);
    await queryRunner.query('ALTER TABLE content_reports ALTER COLUMN "ticketNumber" SET NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_reports_ticketNumber" ON content_reports ("ticketNumber")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE support_requests SET status = 'concluded' WHERE status = 'response_sent'`);
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_single_support_role"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_content_reports_ticketNumber"');
    await queryRunner.query('ALTER TABLE content_reports DROP COLUMN IF EXISTS "ticketNumber"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_support_requests_ticketNumber"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "escalatedToRole"');
    await queryRunner.query('ALTER TABLE support_requests DROP COLUMN IF EXISTS "ticketNumber"');
    await queryRunner.query('DROP SEQUENCE IF EXISTS sophis_report_ticket_seq');
    await queryRunner.query('DROP SEQUENCE IF EXISTS sophis_support_ticket_seq');
  }
}
