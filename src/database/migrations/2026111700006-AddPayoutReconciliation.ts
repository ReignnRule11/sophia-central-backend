import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutReconciliation2026111700006 implements MigrationInterface {
  name = 'AddPayoutReconciliation2026111700006';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payment_payout_reconciliation_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider varchar(32) NOT NULL,
        "periodStart" timestamptz NOT NULL,
        "periodEnd" timestamptz NOT NULL,
        status varchar(16) NOT NULL,
        "providerTransfers" integer NOT NULL DEFAULT 0,
        "localPayouts" integer NOT NULL DEFAULT 0,
        discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
        "initiatedByUserId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IDX_payment_payout_reconciliation_created
        ON payment_payout_reconciliation_runs ("createdAt" DESC);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE payment_payout_reconciliation_runs');
  }
}