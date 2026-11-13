import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenamePlatformModerator2026111300005 implements MigrationInterface {
  name = 'RenamePlatformModerator2026111300005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Rename only the existing platform moderator account with the old display name.
    // Email addresses, password hashes, IDs, and all authentication data remain unchanged.
    await queryRunner.query(`
      UPDATE "users"
      SET "firstName" = 'Sophis',
          "lastName" = 'Moderator'
      WHERE "role" = 'moderator'
        AND "firstName" = 'Sophia'
        AND "lastName" = 'Moderator'
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // No safe reverse value is known; do not guess the previous display name.
  }
}
