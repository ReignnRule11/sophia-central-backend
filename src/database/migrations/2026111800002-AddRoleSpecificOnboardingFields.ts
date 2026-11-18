import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleSpecificOnboardingFields2026111800002 implements MigrationInterface {
  name = 'AddRoleSpecificOnboardingFields2026111800002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "academicTitle" varchar(120)');
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teachingAreas" jsonb');
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "researchInterests" text');
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "studentInterests" jsonb');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "studentInterests"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "researchInterests"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "teachingAreas"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "academicTitle"');
  }
}
