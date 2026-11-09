import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessageUserHides2026110800003 implements MigrationInterface {
  name = 'CreateChatMessageUserHides2026110800003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chat_message_user_hides (
      "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "messageId" uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT pk_chat_message_user_hides PRIMARY KEY ("userId", "messageId")
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_chat_message_user_hides_message ON chat_message_user_hides ("messageId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_message_user_hides_message');
    await queryRunner.query('DROP TABLE IF EXISTS chat_message_user_hides');
  }
}
