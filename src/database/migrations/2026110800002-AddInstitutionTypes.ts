import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstitutionTypes2026110800002 implements MigrationInterface {
  name = 'AddInstitutionTypes2026110800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "institutionType" character varying NOT NULL DEFAULT 'university'`);
    await queryRunner.query(`ALTER TABLE "academic_catalogue_submissions" ADD COLUMN IF NOT EXISTS "institutionType" character varying NOT NULL DEFAULT 'university'`);
    await queryRunner.query(`UPDATE "institutions" SET "institutionType" = 'university' WHERE "institutionType" IS NULL OR "institutionType" = ''`);
    await queryRunner.query(`UPDATE "academic_catalogue_submissions" SET "institutionType" = 'university' WHERE "institutionType" IS NULL OR "institutionType" = ''`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_institutions_institution_type" ON "institutions" ("institutionType")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_institutions_institution_type"`);
    await queryRunner.query(`ALTER TABLE "academic_catalogue_submissions" DROP COLUMN IF EXISTS "institutionType"`);
    await queryRunner.query(`ALTER TABLE "institutions" DROP COLUMN IF EXISTS "institutionType"`);
  }
}
