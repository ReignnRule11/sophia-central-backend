#!/usr/bin/env node
'use strict';

/**
 * Read-only Cloudflare R2 inventory for Sophis Central.
 *
 * Run from the backend repository:
 *   node --env-file=.env scripts/audit-r2-storage.cjs
 *
 * Required environment variables:
 *   DATABASE_URL
 *   AWS_S3_ENDPOINT       (Cloudflare R2 S3 API endpoint, not the public URL)
 *   AWS_S3_BUCKET_NAME    (defaults to sophia-central)
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION            (defaults to auto)
 *   AWS_S3_BUCKET_URL     (public URL base used by the application)
 *
 * This script never deletes or changes objects or database rows. It produces
 * a JSON report and CSV manifest. Treat candidates as review items, not as
 * automatic deletion approval.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');

const REQUIRED = ['DATABASE_URL', 'AWS_S3_ENDPOINT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_URL'];
for (const name of REQUIRED) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const bucket = process.env.AWS_S3_BUCKET_NAME || 'sophia-central';
const region = process.env.AWS_REGION || 'auto';
const graceDays = Number(process.env.R2_ORPHAN_GRACE_DAYS || 7);
if (!Number.isFinite(graceDays) || graceDays < 1) {
  console.error('R2_ORPHAN_GRACE_DAYS must be a number greater than or equal to 1.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  region,
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
  if (!/^https?:\/\//i.test(raw)) {
    return raw.startsWith('/') ? raw.slice(1) : raw;
  }
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

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

async function readCleanupQueue() {
  try {
    return await pool.query('SELECT status, COUNT(*)::int AS count FROM storage_cleanup_jobs GROUP BY status');
  } catch (error) {
    // The audit can also be run before the cleanup migration has been deployed.
    if (error && error.code === '42P01') return { rows: [] };
    throw error;
  }
}

async function queryReferences() {
  const refs = new Map();
  const add = (value, source) => {
    const key = keyFromReference(value);
    if (!key) return;
    const sources = refs.get(key) || new Set();
    sources.add(source);
    refs.set(key, sources);
  };

  const [profiles, resources, legacy, voices, forwardedVoices, support, pending, cleanupJobs] = await Promise.all([
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
    readCleanupQueue(),
  ]);

  for (const row of profiles.rows) add(row.value, 'users.profileImage');
  for (const row of resources.rows) add(row.value, 'resources.fileUrl');
  for (const row of legacy.rows) add(row.value, 'resource_files.s3_key');
  for (const row of voices.rows) add(row.value, 'active chat_messages.voiceKey');
  for (const row of forwardedVoices.rows) add(row.value, 'active forwarded chat voice');
  for (const row of pending.rows) add(row.value, 'recent pending upload (<24h)');

  for (const row of support.rows) {
    const attachments = Array.isArray(row.value) ? row.value : [];
    for (const attachment of attachments) add(attachment, 'support_requests.attachments');
  }

  return refs;
}

async function listBucketObjects() {
  const objects = [];
  let continuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    for (const item of page.Contents || []) {
      if (!item.Key) continue;
      objects.push({
        key: item.Key,
        size: item.Size ?? 0,
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function main() {
  const references = await queryReferences();
  const objects = await listBucketObjects();
  const cutoff = Date.now() - graceDays * 24 * 60 * 60 * 1000;
  const objectKeys = new Set(objects.map((item) => item.key));

  const inventory = objects.map((item) => {
    const sources = [...(references.get(item.key) || [])];
    const oldEnough = item.lastModified && new Date(item.lastModified).getTime() <= cutoff;
    return {
      ...item,
      referenceSources: sources,
      classification: sources.length ? 'referenced_keep' : oldEnough ? 'unreferenced_candidate_review' : 'unreferenced_within_grace_period',
    };
  });

  const missingReferences = [...references.entries()]
    .filter(([key]) => !objectKeys.has(key))
    .map(([key, sources]) => ({ key, referenceSources: [...sources] }));

  const summary = inventory.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] || 0) + 1;
    acc.totalBytes += item.size;
    if (item.classification === 'referenced_keep') acc.referencedBytes += item.size;
    if (item.classification === 'unreferenced_candidate_review') acc.candidateBytes += item.size;
    return acc;
  }, { totalObjects: inventory.length, totalBytes: 0, referencedBytes: 0, candidateBytes: 0 });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(process.cwd(), 'storage-audit');
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `r2-inventory-${stamp}.json`);
  const csvPath = path.join(outputDir, `r2-inventory-${stamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    bucket,
    graceDays,
    summary,
    cleanupQueue: cleanupJobs.rows,
    missingReferences,
    objects: inventory,
  }, null, 2));

  const headers = ['key', 'size', 'lastModified', 'classification', 'referenceSources'];
  const lines = [headers.join(',')];
  for (const item of inventory) {
    lines.push([
      item.key, item.size, item.lastModified, item.classification,
      item.referenceSources.join('; '),
    ].map(csvCell).join(','));
  }
  fs.writeFileSync(csvPath, lines.join('\n') + '\n');

  console.log(JSON.stringify({
    bucket,
    summary,
    missingReferenceCount: missingReferences.length,
    cleanupQueue: cleanupJobs.rows,
    jsonReport: jsonPath,
    csvReport: csvPath,
    note: 'Read-only audit. No database rows or R2 objects were changed.',
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('R2 inventory failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    s3.destroy();
  });
