import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWireframeAcademicProfile2026102600001
  implements MigrationInterface
{
  name = 'AddWireframeAcademicProfile2026102600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "programme" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coursesTaught" jsonb',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "coursesTaught"',
    );
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "programme"',
    );
  }
}
