import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentReconciliationRuns2026111700004 implements MigrationInterface {
  name = 'CreatePaymentReconciliationRuns2026111700004';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payment_reconciliation_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider varchar(32) NOT NULL,
        "periodStart" timestamptz NOT NULL,
        "periodEnd" timestamptz NOT NULL,
        status varchar(16) NOT NULL CHECK (status IN ('completed','failed')),
        "providerTransactions" integer NOT NULL DEFAULT 0,
        "localPayments" integer NOT NULL DEFAULT 0,
        "providerRefunds" integer NOT NULL DEFAULT 0,
        "localRefunds" integer NOT NULL DEFAULT 0,
        discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
        "initiatedByUserId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CHECK ("periodEnd" > "periodStart")
      )
    `);
    await q.query('CREATE INDEX IDX_payment_reconciliation_created ON payment_reconciliation_runs ("createdAt" DESC)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE payment_reconciliation_runs');
  }
}
