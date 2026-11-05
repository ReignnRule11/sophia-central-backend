import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkDepartmentSubmissionsToFacultySubmissions2026110500001 implements MigrationInterface {
  name = 'LinkDepartmentSubmissionsToFacultySubmissions2026110500001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions ADD COLUMN IF NOT EXISTS "parentFacultySubmissionId" varchar`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_academic_catalogue_parent_faculty_submission" ON academic_catalogue_submissions ("parentFacultySubmissionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_academic_catalogue_parent_faculty_submission"`);
    await queryRunner.query(`ALTER TABLE academic_catalogue_submissions DROP COLUMN IF EXISTS "parentFacultySubmissionId"`);
  }
}