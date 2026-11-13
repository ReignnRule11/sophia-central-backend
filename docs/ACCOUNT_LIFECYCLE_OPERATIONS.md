# Account lifecycle operations

## Policy

- User-requested permanent deletion has a 30-day grace period, calculated from the server's UTC timestamp.
- Deactivation is reversible and retains the account and its data.
- Moderator suspension remains separate from user deactivation.
- A user can cancel a pending deletion during the grace period by submitting their registered email, current password and configured security answer.
- After the scheduled purge, restoration is not guaranteed. Approved shared academic resources remain available with the uploader identity detached; non-approved drafts/submissions are removed. In the resource reader and review queue, detached uploaders are labelled **Former contributor**; open-source materials without an identified uploader are labelled **Anonymous contributor**. Shared conversation content is retained with the deleted sender anonymized.

## Account states

- `active`: normal account access.
- `deactivated`: user voluntarily deactivated; a successful password sign-in reactivates the account.
- `pending_deletion`: access is blocked and permanent cleanup is scheduled.
- `isSuspended`: remains the separate moderator/admin-imposed suspension flag.

## Permanent deletion worker

The API records the deletion deadline; a separate scheduled process performs irreversible cleanup after the deadline. The worker reuses the existing account cleanup transaction and queues owned R2 objects for reference-safe cleanup.

Configure a Render Cron Job using the backend repository and the same production database, Redis (if required by the app bootstrap), R2 and application environment settings as the API service.

Recommended configuration:
- Build command: use the backend's normal production Docker/build process.
- One-time preflight after deployment: run `npm run migration:run` separately, then verify the migration result. Do not rerun migrations as part of every scheduled purge.
- Run command: `npm run account-deletion:purge`.
- Before enabling destructive execution, run `npm run account-deletion:purge -- --dry-run`. This reports the number of due accounts and whether the 100-account batch limit will leave additional accounts for a later run; it does not delete accounts or files.
- Schedule: once daily, during a low-traffic period.
- Prevent overlapping executions.
- Alert on non-zero exit status and inspect the application logs.
- Confirm `DATABASE_URL` points to the intended production Neon database and that the production R2 endpoint, bucket and credentials are correct; supply Redis and other required runtime settings if application bootstrap needs them.
- Do not run this worker against development or test database credentials.
- Keep the Cron Job disabled until the dry-run output, production database target, approved-resource retention behavior and storage cleanup configuration have been independently checked.

The job processes up to 100 due accounts per execution. If more than 100 are due, the next daily run continues processing. Increase the batch size only after checking database and storage-cleanup load.


## Deleted-account recovery appeals

The current implementation supports cancellation before the 30-day purge. It does not restore an account after permanent cleanup. Recommended future policy: retain a minimal, encrypted recovery archive for **14 days after the purge**, isolated from the live application database, with tightly restricted and audited support/admin access, identity verification before restoration, and automatic expiry. The archive must exclude credentials and security-question answers; restore should require an explicit approval and integrity checks. This archive and restore workflow are **not implemented** by this PR, so do not promise post-purge recovery. The email appeal workflow is deferred to the support/notifications configuration phase.

## Operational email work deferred

Deletion-request confirmation, the day-25 reminder, appeal acknowledgement, recovery decisions and support notifications should be connected during the dedicated support/notifications email configuration stage. Before enabling them, confirm the official support mailbox and verified sender identity. See `docs/SUPPORT_EMAIL_SETUP.md` for the existing Resend setup requirements. Do not place credentials in source control.
