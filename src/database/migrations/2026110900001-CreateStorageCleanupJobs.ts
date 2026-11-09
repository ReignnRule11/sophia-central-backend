import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStorageCleanupJobs2026110900001 implements MigrationInterface {
  name = 'CreateStorageCleanupJobs2026110900001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "objectKey" text NOT NULL UNIQUE,
        reason varchar(240) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'processing', 'deleted', 'protected', 'failed')),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        "availableAt" timestamptz NOT NULL DEFAULT NOW(),
        "lockedAt" timestamptz NULL,
        "lastError" text NULL,
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_storage_cleanup_due
      ON storage_cleanup_jobs (status, "availableAt", "createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_storage_cleanup_due');
    await queryRunner.query('DROP TABLE IF EXISTS storage_cleanup_jobs');
  }
}
