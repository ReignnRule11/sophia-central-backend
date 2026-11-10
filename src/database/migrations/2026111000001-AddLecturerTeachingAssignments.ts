import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLecturerTeachingAssignments2026111000001 implements MigrationInterface {
  name = 'AddLecturerTeachingAssignments2026111000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teachingAssignments" jsonb',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "teachingAssignments"',
    );
  }
}
