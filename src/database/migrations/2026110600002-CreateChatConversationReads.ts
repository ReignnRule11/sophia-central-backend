import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatConversationReads2026110600002 implements MigrationInterface {
  name = 'CreateChatConversationReads2026110600002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chat_conversation_reads (
      "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "roomKey" varchar(255) NOT NULL,
      "lastReadAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT pk_chat_conversation_reads PRIMARY KEY ("userId", "roomKey")
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_chat_conversation_reads_user ON chat_conversation_reads ("userId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_conversation_reads_user');
    await queryRunner.query('DROP TABLE IF EXISTS chat_conversation_reads');
  }
}
