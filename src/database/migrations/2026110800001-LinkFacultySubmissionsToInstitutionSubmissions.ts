import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkFacultySubmissionsToInstitutionSubmissions2026110800001 implements MigrationInterface {
  name = 'LinkFacultySubmissionsToInstitutionSubmissions2026110800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions ADD COLUMN IF NOT EXISTS "parentInstitutionSubmissionId" varchar`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_catalogue_parent_institution_submission" ON academic_catalogue_submissions ("parentInstitutionSubmissionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_academic_catalogue_parent_institution_submission"`);
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions DROP COLUMN IF EXISTS "parentInstitutionSubmissionId"`);
  }
}
