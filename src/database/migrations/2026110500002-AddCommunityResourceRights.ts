import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommunityResourceRights2026110500002 implements MigrationInterface {
  name = 'AddCommunityResourceRights2026110500002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "resources_license_enum" AS ENUM ('CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'ALL-RIGHTS-RESERVED')`);
    await queryRunner.query(`ALTER TABLE "resources" ADD "license" "resources_license_enum"`);
    await queryRunner.query(`ALTER TABLE "resources" ADD "attribution" varchar(300)`);
    await queryRunner.query(`ALTER TABLE "resources" ADD "sourceUrl" text`);
    await queryRunner.query(`ALTER TABLE "resources" ADD "rightsConfirmed" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "resources" ADD "rightsConfirmedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE INDEX "IDX_resources_public_approved" ON "resources" ("moderationStatus", "rightsConfirmed", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resources_public_approved"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "rightsConfirmedAt"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "rightsConfirmed"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "sourceUrl"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "attribution"`);
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "license"`);
    await queryRunner.query(`DROP TYPE "resources_license_enum"`);
  }
}
