import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentLedgerAdjustments2026111700003 implements MigrationInterface {
  name = 'CreatePaymentLedgerAdjustments2026111700003';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payment_ledger_adjustments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "refundId" uuid NOT NULL REFERENCES payment_refunds(id) ON DELETE RESTRICT,
        "paymentId" uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
        kind varchar(24) NOT NULL CHECK (kind IN ('platform_refund','lecturer_refund')),
        "beneficiaryUserId" uuid REFERENCES users(id) ON DELETE RESTRICT,
        "amountMinor" bigint NOT NULL CHECK ("amountMinor" > 0),
        currency varchar(3) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("refundId", kind)
      )
    `);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE payment_ledger_adjustments'); }
}
