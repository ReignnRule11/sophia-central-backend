import AWS from 'aws-sdk';
import { ResourceFilesRepository } from '../resource-files.repository';
import { DataSource } from 'typeorm';
import fetch from 'node-fetch';

// Scanner worker improvements: prefer HTTP scan if CLAMAV_HTTP_SCAN_URL provided.
// If CLAMAV_DAEMON_ADDR is provided and 'clamdjs' package is available, use TCP clamd scan via clamdjs.
// Fallback: for local-dev, mark files as passed when no ClamAV configured.

async function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function parseClamavAddr(addr: string) {
  const parts = addr.split(':');
  return { host: parts[0], port: Number(parts[1] || 3310) };
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

  const clamAddr = process.env.CLAMAV_DAEMON_ADDR || '';
  const clamHttpUrl = process.env.CLAMAV_HTTP_SCAN_URL || '';

  console.log('Scanner worker started, clamav addr:', clamAddr, 'httpUrl:', clamHttpUrl);

  // Try to require clamdjs if available
  let clamdClient: any = null;
  if (clamAddr) {
    try {
      // clamdjs or clamscan libraries provide similar APIs; try to load clamdjs
      // Note: ensure you add a real clamd client (e.g., 'clamdjs') to package.json in your project for production
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const clamd = require('clamdjs');
      const { host, port } = parseClamavAddr(clamAddr);
      clamdClient = clamd.createScanner(host, port);
      console.log('clamdjs client loaded');
    } catch (e) {
      console.warn('clamdjs not available, TCP clamd integration disabled. Install clamdjs or provide CLAMAV_HTTP_SCAN_URL for scanning.');
      clamdClient = null;
    }
  }

  while (true) {
    try {
      const todo = await repo.findUnscanned(5);
      for (const f of todo) {
        console.log('Scanning', f.s3_key);
        // download object
        const obj = await s3.getObject({ Bucket: process.env.S3_BUCKET, Key: f.s3_key }).promise();
        const buffer = obj.Body as Buffer;

        let passed = false;
        let scanResult: any = null;

        try {
          if (clamHttpUrl) {
            // POST to HTTP scan wrapper
            const res = await fetch(clamHttpUrl, { method: 'POST', body: buffer });
            const json = await res.json();
            passed = !!json?.clean;
            scanResult = json;
          } else if (clamdClient) {
            // clamdjs scanner: scanBuffer or scanStream depending on library
            try {
              // many clamd clients expose a scanBuffer helper
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              const result = await clamdClient.scanBuffer(buffer);
              // interpret result using common clamdjs return format
              // e.g., {is_infected: false, viruses: []}
              passed = !result?.is_infected && (result?.viruses?.length === 0 || result?.viruses === undefined);
              scanResult = result;
            } catch (err) {
              // If the client exposes a different API, try scanStream
              try {
                const streamResult = await clamdClient.scanStream(buffer);
                passed = !streamResult?.is_infected;
                scanResult = streamResult;
              } catch (err2) {
                console.error('clamd client scan failed', err2);
                passed = false;
                scanResult = { error: String(err2) };
              }
            }
          } else {
            // No clamav configured; for local dev we mark as passed to allow iteration
            console.warn('No ClamAV configured; marking file as passed for local development. Configure CLAMAV_HTTP_SCAN_URL or CLAMAV_DAEMON_ADDR for real scanning.');
            passed = true;
            scanResult = { info: 'no-clamav-config - auto-pass for local dev' };
          }
        } catch (err) {
          console.error('Error scanning file', err);
          passed = false;
          scanResult = { error: String(err) };
        }

        await repo.markScanResult(f.id, passed, { scanResult });
        if (!passed) {
          // notify admin or create moderation flag in DB (left as TODO)
          console.warn('File failed scan', f.id, f.s3_key);
        } else {
          console.log('File passed scan', f.id);
        }
      }
    } catch (err) {
      console.error('Scanner worker error', err);
    }

    await sleep(2000);
  }
}
