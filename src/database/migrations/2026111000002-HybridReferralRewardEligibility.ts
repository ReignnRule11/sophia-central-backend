import { MigrationInterface, QueryRunner } from 'typeorm';

export class HybridReferralRewardEligibility2026111000002 implements MigrationInterface {
  name = 'HybridReferralRewardEligibility2026111000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "rewardStatus" character varying(20) NOT NULL DEFAULT 'pending'`);
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "rewardAwardedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "reviewReason" text`);

    // Preserve historical awards only when their matching wallet-ledger transaction
    // exists. Uncredited legacy attributions remain pending for eligibility processing.
    await queryRunner.query(`
      UPDATE referrals
      SET "rewardStatus" = 'awarded',
          "rewardAwardedAt" = COALESCE("redeemedAt", "createdAt")
      WHERE "isCodeOwnerRecord" = false
        AND "referredUserId" IS NOT NULL
        AND "redeemedAt" IS NOT NULL
        AND "rewardAmount" > 0
        AND EXISTS (
          SELECT 1
          FROM point_transactions transaction
          WHERE transaction."userId" = referrals."referrerId"::text
            AND transaction.reason = 'Student referral bonus - referral ' || referrals.id::text
        )
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
