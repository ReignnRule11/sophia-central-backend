import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemovePrivateDmCreationNotifications2026111900001 implements MigrationInterface {
  name = 'RemovePrivateDmCreationNotifications2026111900001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "notifications" WHERE "type" = 'chat_retention' AND "title" = 'Disappearing messages enabled'`);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Deleted notifications cannot be recreated without their original recipient,
    // timestamps, read state, and conversation context.
  }
}
