import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcademicHandle2026110100001 implements MigrationInterface {
  name = 'AddAcademicHandle2026110100001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "academicHandle" character varying(30)`);
    // Existing accounts remain valid with a NULL handle; new registrations require one.
    // The case-insensitive partial unique index enforces uniqueness even under concurrent signups.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_academic_handle_unique" ON "users" (LOWER("academicHandle")) WHERE "academicHandle" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_academic_handle_unique"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "academicHandle"`);
  }
}
