#!/usr/bin/env node
'use strict';

/**
 * Clear uploaded-file references for explicitly selected TEST accounts.
 * This does not delete user accounts, resource records, support requests, or chat rows. It removes legacy file-reference rows for the selected test users.
 * It queues their R2 objects for the normal reference-checked deletion worker.
 *
 * Dry run:
 *   R2_TEST_USER_IDS=id1,id2 node --env-file=.env scripts/reset-test-account-storage.cjs
 *
 * Apply:
 *   R2_TEST_USER_IDS=id1,id2 node --env-file=.env scripts/reset-test-account-storage.cjs \
 *     --apply --confirm-bucket=sophia-central --confirm-user-ids=id1,id2
 */

const { Pool } = require('pg');

const bucket = process.env.AWS_S3_BUCKET_NAME || 'sophia-central';
const ids = [...new Set((process.env.R2_TEST_USER_IDS || '').split(',').map(v => v.trim()).filter(Boolean))].sort();
const apply = process.argv.includes('--apply');
const confirmBucket = process.argv.find(v => v.startsWith('--confirm-bucket='))?.split('=')[1];
const confirmIds = (process.argv.find(v => v.startsWith('--confirm-user-ids='))?.split('=')[1] || '')
  .split(',').map(v => v.trim()).filter(Boolean).sort();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DB_REQUIRED = process.env.DATABASE_URL ? [] : ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
if (!process.env.AWS_S3_BUCKET_URL || DB_REQUIRED.some(name => !process.env[name])) {
  console.error('Missing AWS_S3_BUCKET_URL or the backend Neon database environment variables.');
  process.exit(1);
}
if (!ids.length || ids.some(id => !uuid.test(id))) {
  console.error('Set R2_TEST_USER_IDS to a comma-separated list of exact test-account UUIDs.');
  process.exit(1);
}
if (apply && (confirmBucket !== bucket || confirmIds.join(',') !== ids.join(','))) {
  console.error('Refusing changes. Confirm the exact bucket and exact R2_TEST_USER_IDS list.');
  process.exit(1);
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    })
  : new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    });

function objectKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\//, '');
  try {
    const url = new URL(raw);
    const base = new URL(process.env.AWS_S3_BUCKET_URL || '');
    if (url.host !== base.host) return null;
    const prefix = base.pathname.replace(/\/$/, '');
    if (!url.pathname.startsWith(prefix + '/')) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length + 1));
  } catch {
    return null;
  }
}

function safeKey(value) {
  const key = objectKey(value);
  const prefixes = ['profile-images/', 'resources/', 'support-attachments/', 'voice-messages/'];
  if (!key || key.startsWith('/') || key.includes('\\') ||
      key.split('/').some(part => !part || part === '.' || part === '..') ||
      !prefixes.some(prefix => key.startsWith(prefix))) return null;
  return key;
}

async function collect(client) {
  const params = [ids];
  const [users, resources, uploads, legacy, support, voices] = await Promise.all([
    client.query('SELECT id, "profileImage" FROM users WHERE id = ANY($1::uuid[])', params),
    client.query('SELECT id, "fileUrl" FROM resources WHERE "uploaderId"::text = ANY($1::text[]) AND "fileUrl" IS NOT NULL', params),
    client.query('SELECT id, "s3Key" FROM file_uploads WHERE "userId"::text = ANY($1::text[])', params),
    client.query('SELECT legacy.s3_key FROM resource_files legacy JOIN resources resource ON resource.id = legacy.resource_id WHERE resource."uploaderId"::text = ANY($1::text[])', params),
    client.query('SELECT id, attachments FROM support_requests WHERE "userId" = ANY($1::uuid[])', params),
    client.query('SELECT id, "voiceKey" FROM chat_messages WHERE "senderId" = ANY($1::uuid[]) AND "voiceKey" IS NOT NULL AND "isDeleted" = false', params),
  ]);

  const references = [];
  for (const row of users.rows) if (row.profileImage) references.push({ value: row.profileImage, reason: 'test-account-profile-image' });
  for (const row of resources.rows) references.push({ value: row.fileUrl, reason: 'test-account-resource-file' });
  for (const row of uploads.rows) references.push({ value: row.s3Key, reason: 'test-account-upload' });
  for (const row of legacy.rows) references.push({ value: row.s3_key, reason: 'test-account-legacy-resource-file' });
  for (const row of support.rows) {
    for (const attachment of (Array.isArray(row.attachments) ? row.attachments : [])) {
      if (typeof attachment === 'string') references.push({ value: attachment, reason: 'test-account-support-attachment' });
    }
  }
  for (const row of voices.rows) references.push({ value: row.voiceKey, reason: 'test-account-chat-voice' });

  const keys = new Map();
  for (const item of references) {
    const key = safeKey(item.value);
    if (key && !keys.has(key)) keys.set(key, item.reason);
  }
  return { users: users.rows, resources: resources.rows, uploads: uploads.rows, legacy: legacy.rows, support: support.rows, voices: voices.rows, keys };
}

async function main() {
  const client = await pool.connect();
  try {
    if (!apply) {
      const data = await collect(client);
      console.log(JSON.stringify({
        mode: 'dry-run',
        bucket,
        selectedTestAccounts: ids,
        foundAccounts: data.users.length,
        profileImages: data.users.filter(row => row.profileImage).length,
        resourceFiles: data.resources.length,
        uploadRecords: data.uploads.length,
        legacyResourceFiles: data.legacy.length,
        supportRequestsWithAttachments: data.support.filter(row => Array.isArray(row.attachments) && row.attachments.length).length,
        chatVoiceFiles: data.voices.length,
        distinctR2ObjectsToQueue: data.keys.size,
        objectKeys: [...data.keys.keys()],
        note: 'No database rows or R2 objects were changed. Review the exact account IDs and object keys before apply.',
      }, null, 2));
      return;
    }

    await client.query('BEGIN');
    const locked = await client.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) FOR UPDATE', [ids]);
    if (locked.rows.length !== ids.length) throw new Error('One or more supplied account IDs do not exist. Nothing was changed.');
    const data = await collect(client);

    for (const [key, reason] of data.keys.entries()) {
      await client.query(
        `INSERT INTO storage_cleanup_jobs ("objectKey", reason, status, "availableAt")
         VALUES ($1, $2, 'queued', NOW())
         ON CONFLICT ("objectKey") DO UPDATE
         SET reason = EXCLUDED.reason, status = 'queued', attempts = 0,
             "availableAt" = LEAST(storage_cleanup_jobs."availableAt", EXCLUDED."availableAt"),
             "lockedAt" = NULL, "lastError" = NULL, "updatedAt" = NOW()
         WHERE storage_cleanup_jobs.status IN ('queued', 'deleted', 'protected', 'failed')`,
        [key, reason],
      );
    }

    await client.query('UPDATE users SET "profileImage" = NULL WHERE id = ANY($1::uuid[])', [ids]);
    await client.query('UPDATE resources SET "fileUrl" = NULL WHERE "uploaderId"::text = ANY($1::text[])', [ids]);
    await client.query('DELETE FROM resource_files WHERE resource_id IN (SELECT id FROM resources WHERE "uploaderId"::text = ANY($1::text[]))', [ids]);
    await client.query('UPDATE file_uploads SET status = \'failed\', "updatedAt" = NOW() WHERE "userId"::text = ANY($1::text[])', [ids]);
    await client.query('UPDATE support_requests SET attachments = \'[]\'::jsonb, "updatedAt" = NOW() WHERE "userId" = ANY($1::uuid[])', [ids]);
    await client.query(
      `UPDATE chat_messages
       SET "isDeleted" = true, text = NULL, "stickerId" = NULL, "updatedAt" = NOW()
       WHERE "senderId" = ANY($1::uuid[]) AND "voiceKey" IS NOT NULL AND "isDeleted" = false`,
      [ids],
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({
      mode: 'apply',
      bucket,
      selectedTestAccounts: ids,
      distinctR2ObjectsQueued: data.keys.size,
      profileImagesCleared: data.users.filter(row => row.profileImage).length,
      resourceFileReferencesCleared: data.resources.length,
      uploadRecordsMarkedFailed: data.uploads.length,
      legacyResourceFileRowsDeleted: data.legacy.length,
      supportRequestsCleared: data.support.filter(row => Array.isArray(row.attachments) && row.attachments.length).length,
      chatVoiceMessagesSoftDeleted: data.voices.length,
      note: 'Database references were cleared transactionally. R2 deletion is performed asynchronously by the reference-checking worker.',
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error('Test-account storage reset failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
