import { MigrationInterface, QueryRunner } from 'typeorm';

export class HybridReferralRewardEligibility2026111000001 implements MigrationInterface {
  name = 'HybridReferralRewardEligibility2026111000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "rewardStatus" character varying(20) NOT NULL DEFAULT 'pending'`);
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "rewardAwardedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "reviewReason" text`);

    // Existing redeemed referral events were rewarded immediately by the previous
    // workflow. Preserve their historical state and never pay them a second time.
    await queryRunner.query(`
      UPDATE referrals
      SET "rewardStatus" = 'awarded',
          "rewardAwardedAt" = COALESCE("redeemedAt", "createdAt")
      WHERE "isCodeOwnerRecord" = false
        AND "referredUserId" IS NOT NULL
        AND "redeemedAt" IS NOT NULL
        AND "rewardAmount" > 0
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_referrals_reward_status_created"
      ON referrals ("rewardStatus", "createdAt")
      WHERE "isCodeOwnerRecord" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referrals_reward_status_created"`);
    await queryRunner.query(`ALTER TABLE referrals DROP COLUMN "reviewReason"`);
    await queryRunner.query(`ALTER TABLE referrals DROP COLUMN "rewardAwardedAt"`);
    await queryRunner.query(`ALTER TABLE referrals DROP COLUMN "rewardStatus"`);
  }
}
