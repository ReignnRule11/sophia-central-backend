import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccessControlsAndSuspension2026110100001 implements MigrationInterface {
  name = 'AddAccessControlsAndSuspension2026110100001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "downloadRestricted" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "isSuspended" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "suspensionReason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "suspensionReason"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "isSuspended"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "downloadRestricted"`);
  }
}
