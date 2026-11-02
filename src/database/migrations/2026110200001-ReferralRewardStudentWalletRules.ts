import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReferralRewardStudentWalletRules2026110200001 implements MigrationInterface {
  name = 'ReferralRewardStudentWalletRules2026110200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "referredUserId" uuid`);
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "rewardRemaining" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`
      ALTER TABLE referrals
      ADD CONSTRAINT "FK_referrals_referred_user"
      FOREIGN KEY ("referredUserId") REFERENCES users(id) ON DELETE SET NULL
    `);
    // Older referrals have no reliable referred-account link. Leave their
    // rewardRemaining at zero rather than attributing historical points by guess.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE referrals DROP CONSTRAINT "FK_referrals_referred_user"`);
    await queryRunner.query(`ALTER TABLE referrals DROP COLUMN "rewardRemaining"`);
    await queryRunner.query(`ALTER TABLE referrals DROP COLUMN "referredUserId"`);
  }
}
