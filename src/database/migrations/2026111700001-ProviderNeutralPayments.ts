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
    await queryRunner.query(`CREATE UNIQUE INDEX UQ_payment_transactions_pending_resource ON payment_transactions ("userId", "resourceId") WHERE purpose = 'resource_purchase' AND status = 'pending' AND "resourceId" IS NOT NULL`);
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
    await queryRunner.query(`
      CREATE FUNCTION prevent_payment_ledger_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Payment ledger entries are append-only; create a compensating entry instead.';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER TRG_payment_ledger_immutable
      BEFORE UPDATE OR DELETE ON payment_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION prevent_payment_ledger_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE resource_purchases`);
    await queryRunner.query(`DROP TRIGGER TRG_payment_ledger_immutable ON payment_ledger_entries`);
    await queryRunner.query(`DROP FUNCTION prevent_payment_ledger_mutation()`);
    await queryRunner.query(`DROP TABLE payment_ledger_entries`);
    await queryRunner.query(`DROP TABLE payment_transactions`);
  }
}
