import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePendingRegistrations2026111300003 implements MigrationInterface {
  name = 'CreatePendingRegistrations2026111300003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_registrations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(320) NOT NULL,
        "registrationData" jsonb NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "referralCode" varchar(32) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_registrations_email" ON "pending_registrations" ("email")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pending_registrations_token_hash" ON "pending_registrations" ("tokenHash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pending_registrations_expires_at" ON "pending_registrations" ("expiresAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "pending_registrations"');
  }
}
