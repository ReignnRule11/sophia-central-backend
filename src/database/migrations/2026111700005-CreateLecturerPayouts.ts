import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLecturerPayouts2026111700005 implements MigrationInterface {
  name = 'CreateLecturerPayouts2026111700005';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE payment_payout_beneficiaries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "lecturerUserId" uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
        provider varchar(32) NOT NULL,
        "recipientCode" varchar(64) NOT NULL,
        "accountName" varchar(128) NOT NULL,
        "bankName" varchar(64) NOT NULL,
        "accountLast4" varchar(4) NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'NGN',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE payment_payouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "lecturerUserId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "beneficiaryId" uuid NOT NULL REFERENCES payment_payout_beneficiaries(id) ON DELETE RESTRICT,
        reference varchar(64) NOT NULL UNIQUE,
        provider varchar(32) NOT NULL,
        "amountMinor" bigint NOT NULL CHECK ("amountMinor" > 0),
        currency varchar(3) NOT NULL DEFAULT 'NGN',
        status varchar(24) NOT NULL CHECK (status IN ('requested','processing','pending','success','failed','reversed','otp')),
        "approvedByUserId" uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
        "providerTransferCode" varchar(64) NULL,
        "providerMetadata" jsonb NULL,
        "failureReason" text NULL,
        "completedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IDX_payment_payout_lecturer_status ON payment_payouts ("lecturerUserId", status);
      CREATE INDEX IDX_payment_payout_created ON payment_payouts ("createdAt" DESC);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE payment_payouts');
    await q.query('DROP TABLE payment_payout_beneficiaries');
  }
}
