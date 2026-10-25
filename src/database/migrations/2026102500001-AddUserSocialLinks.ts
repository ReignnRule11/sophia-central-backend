import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSocialLinks2026102500001
  implements MigrationInterface
{
  name = 'AddUserSocialLinks2026102500001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN "socialLinks" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN "socialLinks"`,
    );
  }
}
