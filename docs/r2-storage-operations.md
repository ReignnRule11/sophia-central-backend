# Private R2 storage operations

## Canonical object references

The database stores application-owned R2 object keys, not public-looking URLs:

- `profile-images/{userId}/{filename}`
- `resources/{userId}/{filename}`
- `support-attachments/{userId}/{filename}`
- `voice-messages/{userId}/{filename}`

The migration `2026111100001-StoreR2ReferencesAsObjectKeys` converts only references matching those account-scoped patterns. Legacy URL references and external image URLs remain readable during rollout. API download endpoints resolve both legacy URLs and canonical keys and issue short-lived signed GET URLs. Keep the bucket private; do not enable `r2.dev` or public bucket access.

## Malware scanning status

Antivirus scanning is **not part of this migration**. New uploads continue to receive the existing file-signature and MIME checks, but these checks do not detect malware. A separate future project can integrate a scanner once a sustainable service is available. Do not add a mandatory scanner dependency to the production upload path until the service is provisioned and verified.

## Deployment order

1. Merge the canonical-key migration PR after CI passes.
2. Deploy the backend. Its migration runner applies the canonical-key migration at startup.
3. Verify Render logs show migration completion and that a profile image, resource upload, support attachment, and voice message work normally.
4. Run `node --env-file=.env scripts/audit-r2-storage.cjs` with the intended production Neon and R2 environment. It is read-only and writes a JSON/CSV report locally.
5. Confirm every database reference resolves to an object, and confirm the retained moderator profile image remains referenced. Do not run destructive cleanup until the audit reports zero missing references and the manifest has been reviewed.

## Safety notes

- Existing file-signature validation detects MIME spoofing, not malware.
- Antivirus scanning is deferred to a separate future change and must not block normal uploads in this migration.
- Cleanup jobs re-check references in both canonical-key and legacy-URL forms before deletion.
- R2 cleanup remains asynchronous, retryable, and scoped to application-owned keys.
