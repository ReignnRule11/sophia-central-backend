import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartmentResourceCatalogueMetadata2026111200001 implements MigrationInterface {
  name = 'AddDepartmentResourceCatalogueMetadata2026111200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resources"
      ADD COLUMN IF NOT EXISTS "faculty" character varying(200),
      ADD COLUMN IF NOT EXISTS "department" character varying(200),
      ADD COLUMN IF NOT EXISTS "origin" character varying(24) NOT NULL DEFAULT 'community_upload'`);
    await queryRunner.query(`ALTER TABLE "resources"
      ADD CONSTRAINT "CHK_resources_origin" CHECK ("origin" IN ('community_upload', 'open_source'))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resources_department_scope"
      ON "resources" ("institution", "faculty", "department", "moderationStatus")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resources_origin_status"
      ON "resources" ("origin", "moderationStatus")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resources_origin_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resources_department_scope"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP CONSTRAINT IF EXISTS "CHK_resources_origin"`);
    await queryRunner.query(`ALTER TABLE "resources"
      DROP COLUMN IF EXISTS "origin",
      DROP COLUMN IF EXISTS "department",
      DROP COLUMN IF EXISTS "faculty"`);
  }
}
