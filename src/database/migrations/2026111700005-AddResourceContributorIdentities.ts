import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourceContributorIdentities2026111700005 implements MigrationInterface {
  name = 'AddResourceContributorIdentities2026111700005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "contributorUserIds" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resources_contributor_user_ids" ON "resources" USING GIN ("contributorUserIds")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resources_contributor_user_ids"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN IF EXISTS "contributorUserIds"`);
  }
}
