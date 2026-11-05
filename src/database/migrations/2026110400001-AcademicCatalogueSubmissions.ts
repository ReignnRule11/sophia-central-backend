import { MigrationInterface, QueryRunner } from 'typeorm';

export class AcademicCatalogueSubmissions2026110400001 implements MigrationInterface {
  name = 'AcademicCatalogueSubmissions2026110400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE institutions ADD COLUMN IF NOT EXISTS state varchar`);
    await queryRunner.query(`ALTER TABLE institutions ADD COLUMN IF NOT EXISTS ownership varchar`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS academic_catalogue_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entryType" varchar NOT NULL,
        name varchar NOT NULL,
        "parentInstitutionId" varchar,
        "parentFacultyId" varchar,
        country varchar,
        state varchar,
        city varchar,
        ownership varchar,
        status varchar NOT NULL DEFAULT 'pending',
        "submittedBy" uuid NOT NULL,
        "reviewedBy" uuid,
        "reviewNote" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_catalogue_status_created" ON academic_catalogue_submissions (status, "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_catalogue_entry_name" ON academic_catalogue_submissions ("entryType", LOWER(name))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS academic_catalogue_submissions`);
    await queryRunner.query(`ALTER TABLE institutions DROP COLUMN IF EXISTS ownership`);
    await queryRunner.query(`ALTER TABLE institutions DROP COLUMN IF EXISTS state`);
  }
}