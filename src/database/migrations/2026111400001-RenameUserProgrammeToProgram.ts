import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameUserProgrammeToProgram2026111400001
  implements MigrationInterface
{
  name = 'RenameUserProgrammeToProgram2026111400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" RENAME COLUMN "programme" TO "program"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" RENAME COLUMN "program" TO "programme"',
    );
  }
}
