import { MigrationInterface, QueryRunner } from 'typeorm';

export class PermanentStudentReferralCodes2026110300001 implements MigrationInterface {
  name = 'PermanentStudentReferralCodes2026110300001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE referrals ADD COLUMN "isCodeOwnerRecord" boolean NOT NULL DEFAULT false`);

    // The former unique code constraint prevented separate redemption events
    // from reusing the account's permanent code.
    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'referrals'::regclass
          AND contype = 'u'
          AND conkey = ARRAY[(
            SELECT attnum FROM pg_attribute
            WHERE attrelid = 'referrals'::regclass AND attname = 'code' AND NOT attisdropped
          )]::smallint[]
        LIMIT 1;
        IF constraint_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE referrals DROP CONSTRAINT %I', constraint_name);
        END IF;
      END $$;
    `);

    // Preserve each account's earliest existing code. If that row was already
    // redeemed, create a permanent owner row with the same code and retain the
    // old row as historical redemption data.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, "referrerId", code, "isActive", "referredUserId", "redeemedAt",
          ROW_NUMBER() OVER (
            PARTITION BY "referrerId"
            ORDER BY
              CASE WHEN "referredUserId" IS NULL AND "redeemedAt" IS NULL AND "isActive" THEN 0 ELSE 1 END,
              "createdAt" ASC, id ASC
          ) AS rn
        FROM referrals
      )
      UPDATE referrals target
      SET "isCodeOwnerRecord" = true, "isActive" = true, "rewardAmount" = 0, "rewardRemaining" = 0
      FROM ranked
      WHERE ranked.rn = 1
        AND ranked.id = target.id
        AND ranked."referredUserId" IS NULL
        AND ranked."redeemedAt" IS NULL
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT "referrerId", code,
          ROW_NUMBER() OVER (
            PARTITION BY "referrerId"
            ORDER BY
              CASE WHEN "referredUserId" IS NULL AND "redeemedAt" IS NULL AND "isActive" THEN 0 ELSE 1 END,
              "createdAt" ASC, id ASC
          ) AS rn
        FROM referrals
      )
      INSERT INTO referrals ("referrerId", code, "isActive", "isCodeOwnerRecord", "rewardAmount", "rewardRemaining", "createdAt", "updatedAt")
      SELECT ranked."referrerId", ranked.code, true, true, 0, 0, NOW(), NOW()
      FROM ranked
      WHERE ranked.rn = 1
        AND NOT EXISTS (
          SELECT 1 FROM referrals owner
          WHERE owner."referrerId" = ranked."referrerId" AND owner."isCodeOwnerRecord" = true
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_referrals_permanent_code_unique"
      ON referrals (code) WHERE "isCodeOwnerRecord" = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_referrals_one_code_per_referrer"
      ON referrals ("referrerId") WHERE "isCodeOwnerRecord" = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_referrals_one_attribution_per_student"
      ON referrals ("referredUserId") WHERE "referredUserId" IS NOT NULL AND "isCodeOwnerRecord" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referrals_one_attribution_per_student"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referrals_one_code_per_referrer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referrals_permanent_code_unique"`);

    // Make historical event codes unique again before restoring the old
    // constraint; these rows are not active codes and must not be reused.
    await queryRunner.query(`
      UPDATE referrals
      SET code = 'HIST' || REPLACE(id::text, '-', '')
      WHERE "isCodeOwnerRecord" = false
    `);
    await queryRunner.query(`ALTER TABLE referrals ADD CONSTRAINT "UQ_referrals_code_legacy" UNIQUE (code)`);
    await queryRunner.query(`ALTER TABLE referrals DROP COLUMN "isCodeOwnerRecord"`);
  }
}
