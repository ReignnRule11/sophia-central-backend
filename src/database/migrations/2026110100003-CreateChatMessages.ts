import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateChatMessages2026110100003 implements MigrationInterface {
 name = 'CreateChatMessages2026110100003';
 async up(q: QueryRunner): Promise<void> {
  await q.query(`CREATE TABLE IF NOT EXISTS chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind varchar(12) NOT NULL CHECK (kind IN ('group','direct')), "roomKey" varchar(255) NOT NULL, "senderId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, "senderHandle" varchar(30) NOT NULL, "contentType" varchar(12) NOT NULL DEFAULT 'text' CHECK ("contentType" IN ('text','voice','sticker')), text text, "voiceKey" text, "stickerId" varchar(40), "isDeleted" boolean NOT NULL DEFAULT false, "editedAt" timestamp NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), CONSTRAINT chat_messages_content_check CHECK (("contentType"='text' AND text IS NOT NULL AND "voiceKey" IS NULL) OR ("contentType"='voice' AND text IS NULL AND "voiceKey" IS NOT NULL) OR ("contentType"='sticker' AND text IS NULL AND "voiceKey" IS NULL AND "stickerId" IN ('celebrate','thank-you','well-done','studying','thinking','laughing','encouragement','hello')) OR "isDeleted"=true))`);
  await q.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages ("roomKey", "createdAt" DESC)`);
 }
 async down(q: QueryRunner): Promise<void> { await q.query('DROP INDEX IF EXISTS idx_chat_messages_room_created'); await q.query('DROP TABLE IF EXISTS chat_messages'); }
}