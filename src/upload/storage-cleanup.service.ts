import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { S3Service } from './s3.service';

type CleanupJob = { id: string; object_key: string; attempts: number };

@Injectable()
export class StorageCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly dataSource: DataSource, private readonly s3: S3Service) {}

  onModuleInit(): void {
    void this.runBatch();
    this.timer = setInterval(() => void this.runBatch(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private normalizeKey(value: string | null | undefined): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    const key = /^https?:\/\//i.test(trimmed) ? this.s3.getKeyFromPublicUrl(trimmed) : trimmed;
    if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some(part => !part || part === '.' || part === '..')) return null;
    const allowed = ['profile-images/', 'resources/', 'support-attachments/', 'voice-messages/'];
    return allowed.some(prefix => key.startsWith(prefix)) ? key : null;
  }

  async enqueueWithManager(manager: EntityManager, reference: string | null | undefined, reason: string, delayMs = 0): Promise<void> {
    const key = this.normalizeKey(reference);
    if (!key) return;
    await manager.query(
      `INSERT INTO storage_cleanup_jobs ("objectKey", reason, status, "availableAt")
       VALUES ($1, $2, 'queued', NOW() + ($3::bigint * INTERVAL '1 millisecond'))
       ON CONFLICT ("objectKey") DO UPDATE
       SET reason = EXCLUDED.reason, status = 'queued', attempts = 0,
           "availableAt" = EXCLUDED."availableAt", "lockedAt" = NULL,
           "lastError" = NULL, "updatedAt" = NOW()
       WHERE storage_cleanup_jobs.status IN ('deleted', 'protected', 'failed')`,
      [key, reason.slice(0, 240), Math.max(0, Math.floor(delayMs))],
    );
  }

  async enqueue(reference: string | null | undefined, reason: string, delayMs = 0): Promise<void> {
    await this.enqueueWithManager(this.dataSource.manager, reference, reason, delayMs);
  }

  private async queueExpiredPendingUploads(): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const stale = await manager.query(
        `SELECT id, "s3Key" FROM file_uploads
         WHERE status = 'pending' AND "uploadedAt" < NOW() - INTERVAL '24 hours'
         ORDER BY "uploadedAt" ASC FOR UPDATE SKIP LOCKED LIMIT 50`,
      ) as Array<{ id: string; s3Key: string }>;
      for (const upload of stale) {
        await this.enqueueWithManager(manager, upload.s3Key, 'expired-uncompleted-resource-upload');
        await manager.query(
          `UPDATE file_uploads SET status = 'failed', "updatedAt" = NOW()
           WHERE id = $1 AND status = 'pending'`,
          [upload.id],
        );
      }
    });
  }

  private async claimJobs(): Promise<CleanupJob[]> {
    return this.dataSource.transaction(async manager => {
      const rows = await manager.query(
        `WITH candidates AS (
           SELECT id FROM storage_cleanup_jobs
           WHERE (status = 'queued' AND "availableAt" <= NOW())
              OR (status = 'processing' AND "lockedAt" < NOW() - INTERVAL '5 minutes')
           ORDER BY "availableAt" ASC, "createdAt" ASC
           FOR UPDATE SKIP LOCKED LIMIT 25
         )
         UPDATE storage_cleanup_jobs job
         SET status = 'processing', "lockedAt" = NOW(), attempts = job.attempts + 1, "updatedAt" = NOW()
         FROM candidates WHERE job.id = candidates.id
         RETURNING job.id, job."objectKey" AS object_key, job.attempts`,
      );
      return rows as CleanupJob[];
    });
  }

  private async isReferenced(key: string): Promise<boolean> {
    const publicUrl = this.s3.getPublicUrl(key);
    const rows = await this.dataSource.query(
      `SELECT
        EXISTS (SELECT 1 FROM users WHERE "profileImage" = $1) OR
        EXISTS (SELECT 1 FROM resources WHERE "fileUrl" = $1) OR
        EXISTS (SELECT 1 FROM resource_files WHERE s3_key = $2) OR
        EXISTS (SELECT 1 FROM chat_messages WHERE "voiceKey" = $2 AND "isDeleted" = false) OR
        EXISTS (
          SELECT 1 FROM chat_messages forwarded
          JOIN chat_messages original ON original.id = forwarded."forwardedFromMessageId"
          WHERE forwarded."isDeleted" = false AND original."voiceKey" = $2
        ) OR
        EXISTS (SELECT 1 FROM support_requests WHERE attachments @> jsonb_build_array($1::text)) OR
        EXISTS (
          SELECT 1 FROM file_uploads WHERE "s3Key" = $2 AND status = 'pending'
            AND "uploadedAt" > NOW() - INTERVAL '24 hours'
        ) AS referenced`,
      [publicUrl, key],
    );
    return Boolean(rows[0]?.referenced);
  }

  private async finishJob(id: string, status: 'deleted' | 'protected'): Promise<void> {
    await this.dataSource.query(
      `UPDATE storage_cleanup_jobs SET status = $2, "lockedAt" = NULL,
       "lastError" = NULL, "updatedAt" = NOW() WHERE id = $1`,
      [id, status],
    );
  }

  private async retryJob(job: CleanupJob, error: unknown): Promise<void> {
    const message = String(error instanceof Error ? error.message : error).slice(0, 1800);
    const terminal = job.attempts >= 20;
    const delayMinutes = Math.min(360, Math.max(1, 2 ** Math.min(job.attempts, 8)));
    await this.dataSource.query(
      `UPDATE storage_cleanup_jobs SET status = $2,
       "availableAt" = NOW() + ($3::int * INTERVAL '1 minute'),
       "lockedAt" = NULL, "lastError" = $4, "updatedAt" = NOW() WHERE id = $1`,
      [job.id, terminal ? 'failed' : 'queued', delayMinutes, message],
    );
    this.logger.error(`R2 cleanup job ${job.id} failed (attempt ${job.attempts}/20): ${message}`);
  }

  async runBatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.queueExpiredPendingUploads();
      const jobs = await this.claimJobs();
      for (const job of jobs) {
        try {
          if (await this.isReferenced(job.object_key)) {
            await this.finishJob(job.id, 'protected');
            continue;
          }
          await this.s3.deleteObject(job.object_key);
          await this.finishJob(job.id, 'deleted');
        } catch (error) {
          await this.retryJob(job, error);
        }
      }
    } catch (error) {
      this.logger.error(`R2 cleanup batch failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
