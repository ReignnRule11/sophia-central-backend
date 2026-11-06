import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerification2026110600001 implements MigrationInterface {
  name = 'AddEmailVerification2026110600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing accounts have already passed the previous sign-in flow. Preserve their access.
    // The database default is then changed so every newly created account must verify its email.
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "emailVerified" SET DEFAULT false`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "referralCode" character varying(32),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_verification_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_verification_tokens_token_hash" ON "email_verification_tokens" ("tokenHash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_email_verification_tokens_user_id" ON "email_verification_tokens" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_verification_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerified"`);
  }
}
