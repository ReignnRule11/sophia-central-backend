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
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_profile_image_storage
      ON users ("profileImage") WHERE "profileImage" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_resources_file_url_storage
      ON resources ("fileUrl") WHERE "fileUrl" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_resource_files_s3_key_storage
      ON resource_files (s3_key) WHERE s3_key IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chat_voice_key_active_storage
      ON chat_messages ("voiceKey") WHERE "voiceKey" IS NOT NULL AND "isDeleted" = false`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chat_forwarded_message_active_storage
      ON chat_messages ("forwardedFromMessageId") WHERE "forwardedFromMessageId" IS NOT NULL AND "isDeleted" = false`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_support_attachments_storage
      ON support_requests USING GIN (attachments jsonb_path_ops)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_file_uploads_pending_age_storage
      ON file_uploads ("uploadedAt") WHERE status = 'pending'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_file_uploads_pending_age_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_support_attachments_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_forwarded_message_active_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_voice_key_active_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_resource_files_s3_key_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_resources_file_url_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_users_profile_image_storage');
    await queryRunner.query('DROP INDEX IF EXISTS idx_storage_cleanup_due');
    await queryRunner.query('DROP TABLE IF EXISTS storage_cleanup_jobs');
  }
}
