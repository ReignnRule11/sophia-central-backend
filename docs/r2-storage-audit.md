# Cloudflare R2 storage lifecycle

Sophis Central stores uploaded objects in the `sophia-central` Cloudflare R2 bucket through the AWS S3-compatible API.

## Automatic cleanup after deployment

The `storage_cleanup_jobs` table is a transactional outbox for object deletion. Upload, replacement, resource deletion, chat-message deletion, and account deletion paths enqueue cleanup work in the same database transaction as the reference change wherever possible.

The worker starts with the API and checks for due work every minute. It uses PostgreSQL row locks with `SKIP LOCKED`, so multiple API instances can safely share the queue.

Before an object is deleted, the worker checks all supported live references:

- `users.profileImage`
- `resources.fileUrl`
- legacy `resource_files.s3_key`
- active chat voice messages and active forwards of voice messages
- support-request attachment URLs
- recent pending resource uploads (first 24 hours)

Referenced objects are marked `protected`, not deleted. A later removal/replacement enqueues the key again. Deletion is idempotent. Failed R2 operations retry with exponential backoff; after 20 attempts the job is marked `failed` for operator review.

### Abandoned upload windows

- Profile-image presigned uploads: queued for cleanup after 24 hours unless attached to a user profile.
- Chat voice uploads: queued after 24 hours unless attached to an active message or referenced by an active forward.
- Support attachments uploaded but never attached to a support request: queued after 7 days.
- Resource uploads left in `pending`: after 24 hours they are marked `failed` and queued for deletion. Users can initiate a fresh upload instead of reusing an expired pending key.

The backend runtime R2 API token must be scoped to this bucket and allow the object operations the app uses, including object deletion. If delete permission is missing, cleanup jobs will retry and eventually appear as `failed` for operator review.\n\nThe worker only handles objects in the application prefixes `profile-images/`, `resources/`, `support-attachments/`, and `voice-messages/`. It never deletes arbitrary bucket keys.

## Read-only inventory

Run from the backend repository with Node.js 20+:

```bash
node --env-file=.env scripts/audit-r2-storage.cjs
```

Required environment variables:

- Database connection: either `DATABASE_URL`, or the backend's existing `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, and optional `DB_SSL` variables
- `AWS_S3_ENDPOINT` — Cloudflare R2 S3 API endpoint
- `AWS_S3_BUCKET_NAME` — defaults to `sophia-central`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` — defaults to `auto`
- `AWS_S3_BUCKET_URL` — public URL base used by the application
- `R2_ORPHAN_GRACE_DAYS` — optional; defaults to 7

Use a bucket-scoped Cloudflare R2 token with object-list/read permissions for this inventory. Reports are written under `storage-audit/`, which is ignored by Git.

## One-time orphan cleanup

The cleanup utility is dry-run by default. It only considers objects that:
- have no reference in the current Neon database,
- are at least seven days old (or the larger configured grace period), and
- are inside one of the four application-owned prefixes listed above.

First inspect the dry-run report:

```bash
node --env-file=.env scripts/cleanup-r2-orphans.cjs
```

Only after reviewing the candidate list, and confirming the bucket and test/production scope, run:

```bash
node --env-file=.env scripts/cleanup-r2-orphans.cjs --apply --confirm-bucket=sophia-central
```

The apply mode rechecks each candidate against Neon immediately before deleting it. It does not modify database rows. Use an R2 API token scoped to this bucket with object-list and object-delete permissions for apply mode. Never paste credentials into chat or commit them.

## Important distinction for test-account data

An object still referenced by a test user's profile, resource, support request, or chat message is not an orphan. The orphan utility deliberately preserves it. A one-time test-data reset must first identify the exact test account IDs and remove their relevant database references transactionally; the resulting object keys can then pass through the same reference-checked cleanup queue. Do not clear all production user records just because the existing accounts were used for testing.

## Explicit test-account storage reset

If the existing database file references belong to known test accounts, use the account-scoped reset utility. It is dry-run by default and requires the exact account UUID list to be confirmed twice before applying. It clears only file references and upload state for those selected accounts; it does not delete user accounts, resource records, support-request records, or other users' records. Legacy resource-file reference rows for those users are removed. Chat voice messages authored by those accounts are soft-deleted, and shared forwarded audio remains protected by the normal reference checker.

Dry run:

```bash
R2_TEST_USER_IDS=id1,id2 node --env-file=.env scripts/reset-test-account-storage.cjs
```

Apply only after reviewing the dry-run output and verifying every UUID is a test account:

```bash
R2_TEST_USER_IDS=id1,id2 node --env-file=.env scripts/reset-test-account-storage.cjs --apply --confirm-bucket=sophia-central --confirm-user-ids=id1,id2
```

The script clears profile/resource/support file references, marks those accounts' file-upload rows failed, soft-deletes their voice messages, and inserts cleanup jobs in one database transaction. The worker then deletes only objects that remain unreferenced. It intentionally does not choose test accounts automatically.

## Production safety

The scripts never print credentials. Do not run a cleanup script against a development database while pointing it at the production bucket, or vice versa. Before any local backend commit/push or production cleanup, verify the intended production Neon configuration and bucket are selected. The normal application worker performs only queued, reference-checked deletes; it does not mass-delete existing bucket contents.
