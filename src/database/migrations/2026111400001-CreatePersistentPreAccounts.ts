import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePersistentPreAccounts2026111400001 implements MigrationInterface {
  name = 'CreatePersistentPreAccounts2026111400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pre_accounts" (
        "email" character varying(320) PRIMARY KEY,
        "password" character varying(255) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "registration_drafts" (
        "email" character varying(320) PRIMARY KEY,
        "academicHandle" character varying(30) NOT NULL UNIQUE,
        "encryptedPayload" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_registration_drafts_expires_at"
      ON "registration_drafts" ("expiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "registration_drafts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pre_accounts"`);
  }
}
