import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatUserBlocks2026110200001 implements MigrationInterface {
  name = 'CreateChatUserBlocks2026110200001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chat_user_blocks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "blockedUserId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT chat_user_blocks_not_self CHECK ("userId" <> "blockedUserId"),
      CONSTRAINT uq_chat_user_blocks_pair UNIQUE ("userId", "blockedUserId")
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_chat_user_blocks_user ON chat_user_blocks ("userId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_user_blocks_user');
    await queryRunner.query('DROP TABLE IF EXISTS chat_user_blocks');
  }
}
