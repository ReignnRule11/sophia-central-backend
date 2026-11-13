import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Durable, retryable queue for student resource-approval Wisdom Point rewards.
 * The unique resource reference prevents duplicate queue entries.
 */
export class CreateResourceRewardOutbox2026111300001 implements MigrationInterface {
  name = 'CreateResourceRewardOutbox2026111300001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_reward_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "resourceId" uuid NOT NULL UNIQUE REFERENCES resources(id) ON DELETE CASCADE,
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        "nextAttemptAt" timestamptz NOT NULL DEFAULT NOW(),
        "lastError" text,
        "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "CHK_resource_reward_outbox_status" CHECK (status IN ('pending', 'completed'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_resource_reward_outbox_pending" ON resource_reward_outbox (status, "nextAttemptAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS resource_reward_outbox`);
  }
}
