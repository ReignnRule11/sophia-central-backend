import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountLifecycle2026111300001 implements MigrationInterface {
  name = 'AddAccountLifecycle2026111300001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "accountStatus" varchar(24) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "deletionRequestedAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "deletionScheduledAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "securityQuestionId" varchar(48) NULL,
        ADD COLUMN IF NOT EXISTS "securityAnswerHash" text NULL
    `);
    // Approved academic contributions are shared platform content. Detach their
    // uploader identity instead of cascading their deletion with the user row.
    await queryRunner.query(`
      DO $block$
      DECLARE fk record;
      BEGIN
        FOR fk IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'resources'::regclass
            AND contype = 'f'
            AND (SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = conkey[1]) = 'uploaderId'
        LOOP
          EXECUTE format('ALTER TABLE resources DROP CONSTRAINT %I', fk.conname);
        END LOOP;
      END $block$;
    `);
    await queryRunner.query('ALTER TABLE "resources" ALTER COLUMN "uploaderId" DROP NOT NULL');
    await queryRunner.query('ALTER TABLE "resources" ADD CONSTRAINT "FK_resources_uploader_anonymize" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE SET NULL');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_account_deletion_due"
      ON "users" ("deletionScheduledAt")
      WHERE "accountStatus" = 'pending_deletion'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $block$
      BEGIN
        IF EXISTS (SELECT 1 FROM resources WHERE "uploaderId" IS NULL) THEN
          RAISE EXCEPTION 'Cannot roll back uploader anonymization while approved resources have null uploaderId values.';
        END IF;
      END $block$;
    `);
    await queryRunner.query('ALTER TABLE "resources" DROP CONSTRAINT IF EXISTS "FK_resources_uploader_anonymize"');
    await queryRunner.query('ALTER TABLE "resources" ALTER COLUMN "uploaderId" SET NOT NULL');
    await queryRunner.query('ALTER TABLE "resources" ADD CONSTRAINT "FK_resources_uploader_restore" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_account_deletion_due"');
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "securityAnswerHash",
        DROP COLUMN IF EXISTS "securityQuestionId",
        DROP COLUMN IF EXISTS "deletionScheduledAt",
        DROP COLUMN IF EXISTS "deletionRequestedAt",
        DROP COLUMN IF EXISTS "accountStatus"
    `);
  }
}
