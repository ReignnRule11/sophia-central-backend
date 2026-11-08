import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatMessageReplyForwardReferences2026110800001 implements MigrationInterface {
  name = 'AddChatMessageReplyForwardReferences2026110800001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS "replyToMessageId" uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "forwardedFromMessageId" uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON chat_messages ("replyToMessageId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from ON chat_messages ("forwardedFromMessageId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_messages_forwarded_from');
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_messages_reply_to');
    await queryRunner.query('ALTER TABLE chat_messages DROP COLUMN IF EXISTS "forwardedFromMessageId", DROP COLUMN IF EXISTS "replyToMessageId"');
  }
}
