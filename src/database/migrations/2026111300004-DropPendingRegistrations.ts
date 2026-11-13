import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPendingRegistrations2026111300004 implements MigrationInterface {
  name = 'DropPendingRegistrations2026111300004';

  async up(queryRunner: QueryRunner): Promise<void> {
    // New registrations are carried in encrypted, short-lived tokens. The
    // temporary table contained personal details before account creation.
    await queryRunner.query('DROP TABLE IF EXISTS "pending_registrations"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Deliberately do not recreate a table that stores pre-account PII.
  }
}
