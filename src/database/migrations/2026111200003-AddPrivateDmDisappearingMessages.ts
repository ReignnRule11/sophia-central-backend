import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrivateDmDisappearingMessages2026111200003 implements MigrationInterface {
  name = 'AddPrivateDmDisappearingMessages2026111200003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS chat_conversation_retentions (
      "roomKey" varchar(255) PRIMARY KEY,
      "retentionPeriod" varchar(12) NOT NULL DEFAULT '90_days'
        CHECK ("retentionPeriod" IN ('90_days', '7_days', '24_hours', 'off')),
      "updatedBy" uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT chat_conversation_retentions_direct_room CHECK ("roomKey" LIKE 'direct:%')
    )`);
    await queryRunner.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS "expiresAt" timestamp NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_direct_expiry
      ON chat_messages ("expiresAt", "createdAt")
      WHERE kind = 'direct' AND "expiresAt" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_messages_direct_expiry');
    await queryRunner.query('ALTER TABLE chat_messages DROP COLUMN IF EXISTS "expiresAt"');
    await queryRunner.query('DROP TABLE IF EXISTS chat_conversation_retentions');
  }
}
