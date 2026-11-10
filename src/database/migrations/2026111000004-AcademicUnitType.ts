import { MigrationInterface, QueryRunner } from 'typeorm';

export class AcademicUnitType2026111000004 implements MigrationInterface {
  name = 'AcademicUnitType2026111000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE faculties ADD COLUMN IF NOT EXISTS "unitType" varchar NOT NULL DEFAULT 'faculty'`);
    await queryRunner.query(`ALTER TABLE faculties ADD CONSTRAINT "CHK_faculties_unit_type" CHECK ("unitType" IN ('faculty', 'school', 'college'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE faculties DROP CONSTRAINT IF EXISTS "CHK_faculties_unit_type"`);
    await queryRunner.query(`ALTER TABLE faculties DROP COLUMN IF EXISTS "unitType"`);
  }
}
