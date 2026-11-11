# Private R2 storage operations

## Canonical object references

The database stores application-owned R2 object keys, not public-looking URLs:

- `profile-images/{userId}/{filename}`
- `resources/{userId}/{filename}`
- `support-attachments/{userId}/{filename}`
- `voice-messages/{userId}/{filename}`

The migration `2026111100001-StoreR2ReferencesAsObjectKeys` converts only references matching those account-scoped patterns. Legacy URL references and external image URLs remain readable during rollout. API download endpoints resolve both legacy URLs and canonical keys and issue short-lived signed GET URLs. Keep the bucket private; do not enable `r2.dev` or public bucket access.

## Malware scanning is mandatory for new uploads

The active Nest upload pipeline uses the ClamAV daemon `INSTREAM` protocol. It scans the complete uploaded bytes before accepting a profile image, resource, support attachment, or chat voice recording.

Configure these Render environment variables on the backend service:

- `CLAMAV_HOST`: private/internal hostname of the ClamAV daemon service
- `CLAMAV_PORT`: daemon TCP port, normally `3310`

The daemon must be reachable over the private service network and must have current virus definitions. Configure ClamAV `StreamMaxLength` to at least 50 MiB so it can scan the largest allowed resource upload. Do not expose the ClamAV TCP port publicly. The backend fails closed: when the scanner is missing, unreachable, times out, or returns an unrecognized response, the upload is not accepted. Existing signed downloads and already-stored content remain available.

Provision a separate private service running a maintained ClamAV daemon image on the same private network as the backend. Set the backend's `CLAMAV_HOST` to that service's internal hostname and `CLAMAV_PORT=3310`. ClamAV definition updates and service memory are operational requirements; choose a plan with enough memory for the daemon and its signature database. Do not assume a small free instance can reliably run it.

## Deployment order

1. Merge the backend PR after CI passes.
2. Provision and verify the private ClamAV daemon, then set `CLAMAV_HOST` and `CLAMAV_PORT` in Render before reopening uploads.
3. Deploy the backend. Its migration runner applies the canonical-key migration at startup.
4. Verify Render logs show migration completion and that scanner connectivity is healthy through a test upload.
5. Run `node --env-file=.env scripts/audit-r2-storage.cjs` with the intended production Neon and R2 environment. It is read-only and writes a JSON/CSV report locally.
6. Confirm every database reference resolves to an object, and confirm the retained moderator profile image remains referenced. Do not run destructive cleanup until the audit reports zero missing references and the manifest has been reviewed.

## Safety notes

- The scanner service is a required dependency for accepting new uploads; do not disable fail-closed behavior to restore upload availability.
- Signature validation remains in place as a separate content-type check; it is not a substitute for malware scanning.
- Cleanup jobs re-check references in both canonical-key and legacy-URL forms before deletion.
- R2 cleanup remains asynchronous, retryable, and scoped to application-owned keys.
