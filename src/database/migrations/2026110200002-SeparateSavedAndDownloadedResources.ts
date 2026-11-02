import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateSavedAndDownloadedResources2026110200002 implements MigrationInterface {
  name = 'SeparateSavedAndDownloadedResources2026110200002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "saved_resources" ADD COLUMN IF NOT EXISTS "downloadedAt" timestamp NULL');
    // Existing entries were created by the former Download in app action.
    await queryRunner.query('UPDATE "saved_resources" SET "downloadedAt" = "createdAt" WHERE "downloadedAt" IS NULL');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_saved_resources_user_downloaded" ON "saved_resources" ("userId", "downloadedAt" DESC)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_saved_resources_user_downloaded"');
    await queryRunner.query('ALTER TABLE "saved_resources" DROP COLUMN IF EXISTS "downloadedAt"');
  }
}
