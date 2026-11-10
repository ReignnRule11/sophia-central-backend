import { MigrationInterface, QueryRunner } from 'typeorm';

export class AcademicCatalogueProvenance2026111000003 implements MigrationInterface {
  name = 'AcademicCatalogueProvenance2026111000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE faculties ADD COLUMN IF NOT EXISTS "sourceUrl" varchar`);
    await queryRunner.query(`ALTER TABLE faculties ADD COLUMN IF NOT EXISTS "verifiedAt" date`);
    await queryRunner.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS "sourceUrl" varchar`);
    await queryRunner.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS "verifiedAt" date`);
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions ADD COLUMN IF NOT EXISTS "sourceUrl" varchar`);
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions ADD COLUMN IF NOT EXISTS "verifiedAt" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions DROP COLUMN IF EXISTS "verifiedAt"`);
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions DROP COLUMN IF EXISTS "sourceUrl"`);
    await queryRunner.query(`ALTER TABLE departments DROP COLUMN IF EXISTS "verifiedAt"`);
    await queryRunner.query(`ALTER TABLE departments DROP COLUMN IF EXISTS "sourceUrl"`);
    await queryRunner.query(`ALTER TABLE faculties DROP COLUMN IF EXISTS "verifiedAt"`);
    await queryRunner.query(`ALTER TABLE faculties DROP COLUMN IF EXISTS "sourceUrl"`);
  }
}
