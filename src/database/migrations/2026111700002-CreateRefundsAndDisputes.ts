import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefundsAndDisputes2026111700002 implements MigrationInterface {
  name = 'CreateRefundsAndDisputes2026111700002';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payment_refunds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "paymentId" uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
        "idempotencyKey" varchar(64) NOT NULL UNIQUE,
        reference varchar(64) NOT NULL UNIQUE,
        "providerRefundId" varchar(64) UNIQUE,
        "amountMinor" bigint NOT NULL CHECK ("amountMinor" > 0),
        currency varchar(3) NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','needs-attention','failed','processed')),
        "requestedByUserId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        reason varchar(500) NOT NULL,
        "providerMetadata" jsonb,
        "processedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX IDX_payment_refunds_payment_status ON payment_refunds ("paymentId", status)`);
    await q.query(`
      CREATE TABLE payment_disputes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "paymentId" uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
        "providerDisputeId" varchar(64) NOT NULL UNIQUE,
        "amountMinor" bigint NOT NULL CHECK ("amountMinor" > 0),
        currency varchar(3) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','won','lost','closed')),
        reason varchar(128),
        "responseDueAt" timestamptz,
        "providerMetadata" jsonb,
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX IDX_payment_disputes_payment_status ON payment_disputes ("paymentId", status)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE payment_disputes');
    await q.query('DROP TABLE payment_refunds');
  }
}
