import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commercial foundation for lecturer material pricing and stable user identifiers.
 * Existing accounts receive a deterministic unique code; new accounts receive one
 * during registration. Pricing remains free by default until a lecturer explicitly
 * selects a paid option.
 */
export class SophisCommercialFoundation2026111200001 implements MigrationInterface {
  name = 'SophisCommercialFoundation2026111200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "uniqueId" varchar(32)`);

    await queryRunner.query(`
      WITH prepared AS (
        SELECT
          users.id,
          upper(
            CASE
              WHEN cardinality(institution_words.words) > 1
                THEN left(institution_words.words[1], 1) || left(institution_words.words[cardinality(institution_words.words)], 1)
              ELSE left(coalesce(institution_words.words[1], 'SC'), 2)
            END
          ) AS institution_code,
          upper(left(coalesce(nullif(trim(users."firstName"), ''), 'S'), 1) ||
                left(coalesce(nullif(trim(users."lastName"), ''), 'C'), 1)) AS initials,
          row_number() OVER (
            PARTITION BY
              upper(
                CASE
                  WHEN cardinality(institution_words.words) > 1
                    THEN left(institution_words.words[1], 1) || left(institution_words.words[cardinality(institution_words.words)], 1)
                  ELSE left(coalesce(institution_words.words[1], 'SC'), 2)
                END
              ),
              upper(left(coalesce(nullif(trim(users."firstName"), ''), 'S'), 1) ||
                    left(coalesce(nullif(trim(users."lastName"), ''), 'C'), 1))
            ORDER BY users."createdAt", users.id
          ) AS sequence_number
        FROM users
        CROSS JOIN LATERAL (
          SELECT array_agg(words.word ORDER BY words.ordinality)
            FILTER (WHERE lower(words.word) NOT IN ('of', 'the', 'and', 'for', 'at')) AS words
          FROM regexp_split_to_table(
            coalesce(nullif(trim(users.institution), ''), 'Sophis Central'),
            '[[:space:]]+'
          ) WITH ORDINALITY AS words(word, ordinality)
        ) AS institution_words
        WHERE users."uniqueId" IS NULL
      )
      UPDATE users AS target
      SET "uniqueId" = prepared.institution_code || '-' || prepared.initials || '-' ||
                       lpad(prepared.sequence_number::text, 6, '0')
      FROM prepared
      WHERE target.id = prepared.id
    `);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN "uniqueId" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_unique_id" ON users ("uniqueId")`);

    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "pricingMode" varchar(16) NOT NULL DEFAULT 'free'`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "priceAmount" integer`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "customPriceStatus" varchar(16) NOT NULL DEFAULT 'not_required'`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "customPriceReviewedBy" uuid`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "customPriceReviewedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "customPriceReviewNote" text`);
    await queryRunner.query(`ALTER TABLE resources ADD COLUMN IF NOT EXISTS "lastSubstantiveUpdateAt" timestamptz NOT NULL DEFAULT NOW()`);

    await queryRunner.query(`
      ALTER TABLE resources ADD CONSTRAINT "CHK_resources_pricing_mode"
      CHECK ("pricingMode" IN ('free', 'fixed', 'custom'))
    `);
    await queryRunner.query(`
      ALTER TABLE resources ADD CONSTRAINT "CHK_resources_custom_price_status"
      CHECK ("customPriceStatus" IN ('not_required', 'pending', 'approved', 'rejected'))
    `);
    await queryRunner.query(`
      ALTER TABLE resources ADD CONSTRAINT "CHK_resources_price_amount"
      CHECK (
        ("pricingMode" = 'free' AND ("priceAmount" IS NULL OR "priceAmount" = 0) AND "customPriceStatus" = 'not_required')
        OR
        ("pricingMode" = 'fixed' AND "priceAmount" BETWEEN 1 AND 3000 AND "customPriceStatus" = 'not_required')
        OR
        ("pricingMode" = 'custom' AND "priceAmount" > 0 AND "customPriceStatus" IN ('pending', 'approved', 'rejected'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE resources DROP CONSTRAINT IF EXISTS "CHK_resources_price_amount"`);
    await queryRunner.query(`ALTER TABLE resources DROP CONSTRAINT IF EXISTS "CHK_resources_custom_price_status"`);
    await queryRunner.query(`ALTER TABLE resources DROP CONSTRAINT IF EXISTS "CHK_resources_pricing_mode"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "lastSubstantiveUpdateAt"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "customPriceReviewNote"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "customPriceReviewedAt"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "customPriceReviewedBy"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "customPriceStatus"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "priceAmount"`);
    await queryRunner.query(`ALTER TABLE resources DROP COLUMN IF EXISTS "pricingMode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_unique_id"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "uniqueId"`);
  }
}
