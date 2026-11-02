import { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve shared chat content when a student or lecturer deletes their account. */
export class PreserveChatMessagesOnAccountDeletion2026110200001 implements MigrationInterface {
  name = 'PreserveChatMessagesOnAccountDeletion2026110200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS "chat_messages_senderId_fkey"');
    await queryRunner.query('ALTER TABLE chat_messages ALTER COLUMN "senderId" DROP NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Anonymous messages cannot be restored to a deleted user identity.
    await queryRunner.query('DELETE FROM chat_messages WHERE "senderId" IS NULL');
    await queryRunner.query('ALTER TABLE chat_messages ALTER COLUMN "senderId" SET NOT NULL');
    await queryRunner.query('ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES users(id) ON DELETE CASCADE');
  }
}
