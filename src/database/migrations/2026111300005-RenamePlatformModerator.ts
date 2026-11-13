import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenamePlatformModerator2026111300005 implements MigrationInterface {
  name = 'RenamePlatformModerator2026111300005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Change only the display-name fields for moderator-role accounts.
    // Email addresses, password hashes, IDs, and all authentication data remain unchanged.
    await queryRunner.query(`
      UPDATE "users"
      SET "firstName" = 'Sophis',
          "lastName" = 'Moderator'
      WHERE "role" = 'moderator'
        AND ("firstName" IS DISTINCT FROM 'Sophis'
          OR "lastName" IS DISTINCT FROM 'Moderator')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No safe reverse value is known; do not guess the previous display name.
  }
}
