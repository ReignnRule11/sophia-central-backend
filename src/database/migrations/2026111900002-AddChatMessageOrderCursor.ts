import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatMessageOrderCursor2026111900002 implements MigrationInterface {
  name = 'AddChatMessageOrderCursor2026111900002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SEQUENCE IF NOT EXISTS chat_messages_order_seq START WITH 1');
    await queryRunner.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS "messageOrder" bigint');
    await queryRunner.query(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS position
        FROM chat_messages
      )
      UPDATE chat_messages AS message
      SET "messageOrder" = ordered.position
      FROM ordered
      WHERE message.id = ordered.id AND message."messageOrder" IS NULL
    `);
    await queryRunner.query(`
      SELECT setval(
        'chat_messages_order_seq',
        COALESCE((SELECT MAX("messageOrder") FROM chat_messages), 1),
        EXISTS(SELECT 1 FROM chat_messages)
      )
    `);
    await queryRunner.query(`ALTER TABLE chat_messages ALTER COLUMN "messageOrder" SET DEFAULT nextval('chat_messages_order_seq')`);
    await queryRunner.query('ALTER TABLE chat_messages ALTER COLUMN "messageOrder" SET NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_message_order ON chat_messages ("messageOrder")');

    await queryRunner.query('ALTER TABLE chat_conversation_reads ADD COLUMN IF NOT EXISTS "lastReadMessageOrder" bigint NOT NULL DEFAULT 0');
    await queryRunner.query(`
      UPDATE chat_conversation_reads AS read_state
      SET "lastReadMessageOrder" = COALESCE((
        SELECT MAX(message."messageOrder")
        FROM chat_messages AS message
        WHERE message."roomKey" = read_state."roomKey"
          AND message."createdAt" <= read_state."lastReadAt"
      ), 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE chat_conversation_reads DROP COLUMN IF EXISTS "lastReadMessageOrder"');
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_messages_message_order');
    await queryRunner.query('ALTER TABLE chat_messages DROP COLUMN IF EXISTS "messageOrder"');
    await queryRunner.query('DROP SEQUENCE IF EXISTS chat_messages_order_seq');
  }
}
