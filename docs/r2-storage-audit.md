# Cloudflare R2 storage audit

The backend stores uploaded files in the `sophia-central` S3-compatible bucket. The audit script compares a paginated inventory of bucket objects with the database references that are allowed to keep those objects alive.

## Run a read-only audit

Run this from the backend repository with Node.js 20+:

```bash
node --env-file=.env scripts/audit-r2-storage.cjs
```

The script uses the existing backend environment variables:

- `DATABASE_URL`
- `AWS_S3_ENDPOINT` — Cloudflare R2 S3 API endpoint
- `AWS_S3_BUCKET_NAME` — defaults to `sophia-central`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` — defaults to `auto`
- `AWS_S3_BUCKET_URL` — public base URL used by the application
- `R2_ORPHAN_GRACE_DAYS` — optional; defaults to 7 days

Use a Cloudflare R2 token scoped to this bucket with object-list/read permissions only. Keep credentials in the local environment file or deployment secret store; never paste them into chat or commit them.

## How the report classifies objects

- `referenced_keep`: referenced by a profile image, resource, legacy resource file, active chat voice message, support attachment, or a pending upload younger than 24 hours.
- `unreferenced_within_grace_period`: no current reference, but the object is newer than the configured grace period.
- `unreferenced_candidate_review`: no current reference and older than the grace period. This is a review candidate, not automatic deletion approval.

The report also lists database references whose objects are missing from the bucket.

Reports are written under `storage-audit/` as JSON and CSV. That directory should remain local and must not be committed.

## Safety

This script is intentionally read-only. It does not delete bucket objects, update database rows, or change upload statuses. Review candidate keys and their ownership before any deletion. A reference can be shared or copied into another record, so a missing direct resource/profile pointer alone is not sufficient proof that an object is unused.

The existing production database audit showed 21 pending upload rows, but all 26 upload rows had corresponding resource rows. Pending status alone is not proof of an orphan. Use the generated bucket inventory and reference report before cleanup.
