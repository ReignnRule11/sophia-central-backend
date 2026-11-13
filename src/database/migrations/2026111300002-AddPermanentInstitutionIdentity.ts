import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPermanentInstitutionIdentity2026111300002 implements MigrationInterface {
  name = 'AddPermanentInstitutionIdentity2026111300002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "institutions" ADD COLUMN IF NOT EXISTS "institutionCode" varchar(10)');
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "institutionId" uuid NULL');
    await queryRunner.query('ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "uploaderInstitutionId" uuid NULL');
    await queryRunner.query('ALTER TABLE "user_activity_events" ADD COLUMN IF NOT EXISTS "institutionId" uuid NULL');

    // Preserve recognised Nigerian institution abbreviations; generate deterministic,
    // readable catalogue codes for all other catalogue records.
    await queryRunner.query(`
      DO $block$
      DECLARE item record;
      DECLARE normalized text;
      DECLARE words text[];
      DECLARE acronym text;
      DECLARE candidate text;
      DECLARE suffix text;
      DECLARE type_prefix text;
      BEGIN
        FOR item IN SELECT id, name, "institutionType" FROM institutions ORDER BY name, id LOOP
          normalized := lower(regexp_replace(item.name, '[^a-zA-Z0-9]+', ' ', 'g'));
          normalized := trim(regexp_replace(normalized, '\\s+', ' ', 'g'));
          candidate := CASE normalized
            WHEN 'university of lagos' THEN 'UNILAG'
            WHEN 'yaba college of technology' THEN 'YABATECH'
            WHEN 'federal college of education zaria' THEN 'FCEZARIA'
            WHEN 'university of nigeria nsukka' THEN 'UNN'
            WHEN 'federal university of technology akure' THEN 'FUTA'
            ELSE NULL
          END;
          IF candidate IS NULL THEN
            type_prefix := CASE item."institutionType"
              WHEN 'university' THEN 'UNI'
              WHEN 'polytechnic' THEN 'POL'
              WHEN 'monotechnic' THEN 'MON'
              WHEN 'college_of_education' THEN 'COE'
              ELSE 'OTH'
            END;
            words := regexp_split_to_array(normalized, ' ');
            acronym := '';
            FOR i IN 1..coalesce(array_length(words, 1), 0) LOOP
              IF words[i] NOT IN ('the','of','and','for','at','in') AND words[i] <> '' THEN
                acronym := acronym || upper(left(words[i], 1));
              END IF;
            END LOOP;
            IF length(acronym) >= 4 THEN
              candidate := left(acronym, 8);
            ELSE
              candidate := type_prefix || upper(left(words[array_length(words,1)], 5));
            END IF;
            suffix := upper(substr(md5(item.id::text), 1, 2));
            candidate := left(candidate, 8) || suffix;
          END IF;

          IF EXISTS (SELECT 1 FROM institutions other WHERE other."institutionCode" = candidate AND other.id <> item.id) THEN
            candidate := left(candidate, 7) || upper(substr(md5(item.id::text), 1, 3));
          END IF;
          UPDATE institutions SET "institutionCode" = candidate WHERE id = item.id;
        END LOOP;
      END $block$;
    `);

    await queryRunner.query('ALTER TABLE "institutions" ALTER COLUMN "institutionCode" SET NOT NULL');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_institutions_institutionCode" ON "institutions" ("institutionCode")');

    // Attach legacy accounts only where their saved institution name exactly
    // matches one catalogue record. Ambiguous/unmatched records remain untouched
    // for a deliberate reconciliation rather than a guessed institution mapping.
    await queryRunner.query(`
      UPDATE users u
      SET "institutionId" = i.id
      FROM institutions i
      WHERE u."institutionId" IS NULL
        AND u.institution IS NOT NULL
        AND lower(trim(u.institution)) = lower(trim(i.name))
    `);
    await queryRunner.query(`
      UPDATE resources r
      SET "uploaderInstitutionId" = u."institutionId"
      FROM users u
      WHERE r."uploaderId" = u.id AND r."uploaderInstitutionId" IS NULL
    `);
    await queryRunner.query(`
      UPDATE user_activity_events e
      SET "institutionId" = u."institutionId"
      FROM users u
      WHERE e."userId" = u.id::text AND e."institutionId" IS NULL
    `);

    // Refresh IDs for matched student/lecturer accounts into the permanent format.
    // The random suffix is generated once here; application-generated IDs use
    // Crockford Base32 for all new accounts.
    await queryRunner.query(`
      UPDATE users u
      SET "uniqueId" = 'SC-' ||
        CASE i."institutionType"
          WHEN 'university' THEN 'UNI'
          WHEN 'polytechnic' THEN 'POL'
          WHEN 'monotechnic' THEN 'MON'
          WHEN 'college_of_education' THEN 'COE'
          ELSE 'OTH'
        END || '-' || i."institutionCode" || '-' ||
        CASE WHEN u.role = 'lecturer' OR (u.role = 'reviewer' AND u."reviewerBaseRole" = 'lecturer') THEN 'LEC' ELSE 'STU' END ||
        '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
      FROM institutions i
      WHERE u."institutionId" = i.id
        AND (u.role IN ('student','lecturer') OR (u.role = 'reviewer' AND u."reviewerBaseRole" IN ('student','lecturer')))
    `);

    await queryRunner.query('ALTER TABLE "users" ADD CONSTRAINT "FK_users_institution_catalogue" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT');
    await queryRunner.query('ALTER TABLE "resources" ADD CONSTRAINT "FK_resources_uploader_institution" FOREIGN KEY ("uploaderInstitutionId") REFERENCES "institutions"("id") ON DELETE SET NULL');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_users_institutionId" ON "users" ("institutionId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_resources_uploaderInstitutionId" ON "resources" ("uploaderInstitutionId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_resources_uploaderInstitutionId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_institutionId"');
    await queryRunner.query('ALTER TABLE "resources" DROP CONSTRAINT IF EXISTS "FK_resources_uploader_institution"');
    await queryRunner.query('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_institution_catalogue"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_institutions_institutionCode"');
    await queryRunner.query('ALTER TABLE "user_activity_events" DROP COLUMN IF EXISTS "institutionId"');
    await queryRunner.query('ALTER TABLE "resources" DROP COLUMN IF EXISTS "uploaderInstitutionId"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "institutionId"');
    await queryRunner.query('ALTER TABLE "institutions" DROP COLUMN IF EXISTS "institutionCode"');
  }
}
