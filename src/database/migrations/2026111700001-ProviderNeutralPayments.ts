import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderNeutralPayments2026111700001 implements MigrationInterface {
  name = 'ProviderNeutralPayments2026111700001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider varchar(32) NOT NULL,
        reference varchar(64) NOT NULL UNIQUE,
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        purpose varchar(32) NOT NULL CHECK (purpose IN ('wisdom_points_topup','resource_purchase')),
        status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
        "amountMinor" bigint NOT NULL CHECK ("amountMinor" > 0),
        currency varchar(3) NOT NULL DEFAULT 'NGN',
        points integer CHECK (points IS NULL OR points > 0),
        "resourceId" uuid REFERENCES resources(id) ON DELETE RESTRICT,
        "checkoutUrl" text,
        "providerTransactionId" varchar(128),
        "providerMetadata" jsonb,
        "paidAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IDX_payment_transactions_user_created ON payment_transactions ("userId", "createdAt" DESC)`);
    await queryRunner.query(`
      CREATE TABLE payment_ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "paymentId" uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
        kind varchar(24) NOT NULL CHECK (kind IN ('platform_share','lecturer_share')),
        "beneficiaryUserId" uuid REFERENCES users(id) ON DELETE RESTRICT,
        "amountMinor" bigint NOT NULL CHECK ("amountMinor" >= 0),
        currency varchar(3) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("paymentId", kind)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE resource_purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "resourceId" uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
        "paymentId" uuid NOT NULL UNIQUE REFERENCES payment_transactions(id) ON DELETE RESTRICT,
        "purchasedAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("userId", "resourceId")
      )
    `);
    await queryRunner.query(`CREATE INDEX IDX_resource_purchases_resource ON resource_purchases ("resourceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE resource_purchases`);
    await queryRunner.query(`DROP TABLE payment_ledger_entries`);
    await queryRunner.query(`DROP TABLE payment_transactions`);
  }
}
