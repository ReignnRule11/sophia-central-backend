import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourceTags2026102600001 implements MigrationInterface {
  name = 'AddResourceTags2026102600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE resources ADD COLUMN tags jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE resources DROP COLUMN tags');
  }
}
