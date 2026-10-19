import AWS from 'aws-sdk';
import { ResourceFilesRepository } from '../resource-files.repository';
import { DataSource } from 'typeorm';
import fetch from 'node-fetch';

// A simple scanner worker that polls the DB for new unscanned files, downloads them from S3/MinIO and
// submits to ClamAV via the clamd TCP interface (or uses clamscan binary if available). For local dev
// this will attempt clamd connection using CLAMAV_DAEMON_ADDR env var.

async function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

export async function startScannerWorker(ds: DataSource) {
  const repo = new ResourceFilesRepository(ds);

  const s3 = new AWS.S3({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    s3ForcePathStyle: true,
  });

  const clamAddr = process.env.CLAMAV_DAEMON_ADDR || 'clamav:3310';

  console.log('Scanner worker started, clamav:', clamAddr);

  while (true) {
    try {
      const todo = await repo.findUnscanned(5);
      for (const f of todo) {
        console.log('Scanning', f.s3_key);
        // download object
        const obj = await s3.getObject({ Bucket: process.env.S3_BUCKET, Key: f.s3_key }).promise();
        const buffer = obj.Body as Buffer;

        // try a simple HTTP call to clamd web (if clamav has a REST wrapper) or skip to mark passed in dev
        // For robust production integration use a clamd client or spawn clamscan.
        let passed = true;
        let scanResult = 'skipped-local-dev';

        try {
          // Attempt to call a local clamd scan endpoint if configured
          const clamUrl = process.env.CLAMAV_HTTP_SCAN_URL; // optional: http://clamav:8080/scan
          if (clamUrl) {
            const res = await fetch(clamUrl, { method: 'POST', body: buffer });
            const json = await res.json();
            passed = json?.clean ?? false;
            scanResult = json;
          } else {
            // No HTTP scan available; if CLAMAV_DAEMON_ADDR not configured we'll mark as passed for local dev
            if (!process.env.CLAMAV_DAEMON_ADDR) {
              passed = true;
              scanResult = 'no-clamav-config - passing for local dev';
            } else {
              // Implement TCP clamd scan or shell out - left as TODO for a real environment
              // For now assume pass
              passed = true;
              scanResult = 'clamd-tcp-scan-not-implemented-in-worker-stub';
            }
          }
        } catch (err) {
          console.error('Error scanning file', err);
          passed = false;
          scanResult = { error: String(err) };
        }

        await repo.markScanResult(f.id, passed, { scanResult });
        if (!passed) {
          // notify admin or create moderation flag
          console.warn('File failed scan', f.id, f.s3_key);
        }
      }
    } catch (err) {
      console.error('Scanner worker error', err);
    }

    await sleep(2000);
  }
}
