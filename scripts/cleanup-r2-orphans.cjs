#!/usr/bin/env node
'use strict';

/**
 * Explicit, guarded cleanup of old R2 objects with no database references.
 *
 * Dry run:
 *   node --env-file=.env scripts/cleanup-r2-orphans.cjs
 *
 * Apply only after reviewing the dry-run manifest:
 *   node --env-file=.env scripts/cleanup-r2-orphans.cjs --apply --confirm-bucket=sophia-central
 *
 * This script never deletes database rows. Every candidate is checked again
 * against Neon immediately before the R2 DeleteObject request.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const REQUIRED = ['AWS_S3_ENDPOINT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_URL'];
const DB_REQUIRED = process.env.DATABASE_URL ? [] : ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
for (const name of [...REQUIRED, ...DB_REQUIRED]) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const bucket = process.env.AWS_S3_BUCKET_NAME || 'sophia-central';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirmation = args.find((arg) => arg.startsWith('--confirm-bucket='))?.split('=')[1];
if (apply && confirmation !== bucket) {
  console.error(`Refusing deletion. Pass --confirm-bucket=${bucket} to confirm the exact bucket.`);
  process.exit(1);
}

const graceDays = Number(process.env.R2_ORPHAN_GRACE_DAYS || 7);
if (!Number.isFinite(graceDays) || graceDays < 7) {
  console.error('R2_ORPHAN_GRACE_DAYS must be at least 7 days.');
  process.exit(1);
}

const allowedPrefixes = ['profile-images/', 'resources/', 'support-attachments/', 'voice-messages/'];
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
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.AWS_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function keyFromReference(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\//, '');
  try {
    const parsed = new URL(raw);
    const base = new URL(process.env.AWS_S3_BUCKET_URL);
    if (parsed.host !== base.host) return null;
    const prefix = base.pathname.replace(/\/$/, '');
    if (!parsed.pathname.startsWith(prefix + '/')) return null;
    return decodeURIComponent(parsed.pathname.slice(prefix.length + 1));
  } catch {
    return null;
  }
}

function isAllowedKey(key) {
  return typeof key === 'string' && !key.startsWith('/') && !key.includes('\\') &&
    !key.split('/').some((part) => !part || part === '.' || part === '..') &&
    allowedPrefixes.some((prefix) => key.startsWith(prefix));
}

async function listObjects() {
  const objects = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const item of page.Contents || []) {
      if (item.Key) objects.push({
        key: item.Key,
        size: item.Size || 0,
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function queryReferences() {
  const refs = new Set();
  const add = (value) => {
    const key = keyFromReference(value);
    if (key) refs.add(key);
  };
  const [profiles, resources, legacy, voices, forwarded, support, recentPending] = await Promise.all([
    pool.query('SELECT "profileImage" AS value FROM users WHERE "profileImage" IS NOT NULL'),
    pool.query('SELECT "fileUrl" AS value FROM resources WHERE "fileUrl" IS NOT NULL'),
    pool.query('SELECT s3_key AS value FROM resource_files WHERE s3_key IS NOT NULL'),
    pool.query('SELECT "voiceKey" AS value FROM chat_messages WHERE "voiceKey" IS NOT NULL AND "isDeleted" = false'),
    pool.query(`SELECT original."voiceKey" AS value
      FROM chat_messages forwarded
      JOIN chat_messages original ON original.id = forwarded."forwardedFromMessageId"
      WHERE forwarded."isDeleted" = false AND original."voiceKey" IS NOT NULL`),
    pool.query('SELECT attachments AS value FROM support_requests WHERE attachments IS NOT NULL'),
    pool.query(`SELECT "s3Key" AS value FROM file_uploads
      WHERE status = 'pending' AND "uploadedAt" >= NOW() - INTERVAL '24 hours'`),
  ]);
  for (const result of [profiles, resources, legacy, voices, forwarded, recentPending]) {
    for (const row of result.rows) add(row.value);
  }
  for (const row of support.rows) {
    const attachments = Array.isArray(row.value) ? row.value : [];
    for (const value of attachments) add(value);
  }
  return refs;
}

async function isReferenced(key) {
  const base = new URL(process.env.AWS_S3_BUCKET_URL);
  const publicUrl = `${base.toString().replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const rows = await pool.query(
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
      EXISTS (SELECT 1 FROM file_uploads WHERE "s3Key" = $2 AND status = 'pending'
        AND "uploadedAt" > NOW() - INTERVAL '24 hours') AS referenced`,
    [publicUrl, key],
  );
  return Boolean(rows.rows[0]?.referenced);
}

async function main() {
  const refs = await queryReferences();
  const objects = await listObjects();
  const cutoff = Date.now() - graceDays * 86_400_000;
  const candidates = objects.filter((object) =>
    isAllowedKey(object.key) &&
    !refs.has(object.key) &&
    object.lastModified &&
    new Date(object.lastModified).getTime() <= cutoff
  );

  const deleted = [];
  const protectedDuringFinalCheck = [];
  const failed = [];
  if (apply) {
    for (const object of candidates) {
      try {
        if (await isReferenced(object.key)) {
          protectedDuringFinalCheck.push(object.key);
          continue;
        }
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.key }));
        deleted.push(object.key);
      } catch (error) {
        failed.push({ key: object.key, error: String(error?.message || error) });
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(process.cwd(), 'storage-audit');
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `r2-orphan-cleanup-${stamp}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    bucket,
    mode: apply ? 'apply' : 'dry-run',
    graceDays,
    scannedObjects: objects.length,
    candidateCount: candidates.length,
    candidateBytes: candidates.reduce((sum, item) => sum + item.size, 0),
    candidates,
    deleted,
    protectedDuringFinalCheck,
    failed,
    note: apply
      ? 'Only old unreferenced objects in approved application prefixes were deleted. Database rows were not changed.'
      : 'Dry run only. No R2 objects or database rows were changed.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    bucket, mode: report.mode, scannedObjects: report.scannedObjects,
    candidateCount: report.candidateCount, candidateBytes: report.candidateBytes,
    deletedCount: deleted.length, protectedDuringFinalCheck: protectedDuringFinalCheck.length,
    failedCount: failed.length, reportPath,
    note: report.note,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('R2 orphan cleanup failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    s3.destroy();
  });
