import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountTokenVersion2026112800001 implements MigrationInterface {
  name = 'AddAccountTokenVersion2026112800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tokenVersion"`);
  }
}
