import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentCheckoutIdempotency2026111700007 implements MigrationInterface {
  name = 'AddPaymentCheckoutIdempotency2026111700007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE payment_transactions ADD COLUMN "idempotencyKey" varchar(128)`);
    await queryRunner.query(`CREATE UNIQUE INDEX UQ_payment_transactions_user_idempotency ON payment_transactions ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX UQ_payment_transactions_user_idempotency`);
    await queryRunner.query(`ALTER TABLE payment_transactions DROP COLUMN "idempotencyKey"`);
  }
}
