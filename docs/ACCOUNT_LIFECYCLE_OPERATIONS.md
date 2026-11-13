# Account lifecycle operations

## Policy

- User-requested permanent deletion has a 30-day grace period.
- Deactivation is reversible and retains the account and its data.
- Moderator suspension remains separate from user deactivation.
- A user can cancel a pending deletion during the grace period by submitting their registered email, current password and configured security answer.
- After the scheduled purge, restoration is not guaranteed. Shared academic records and conversation content are handled by the existing account-deletion retention rules.

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
- Run command: `npm run migration:run && npm run account-deletion:purge`.
- Schedule: once daily, during a low-traffic period.
- Prevent overlapping executions.
- Alert on non-zero exit status and inspect the application logs.
- Do not run this worker against development or test database credentials.

The job processes up to 100 due accounts per execution. If more than 100 are due, the next daily run continues processing. Increase the batch size only after checking database and storage-cleanup load.

## Operational email work deferred

Deletion-request confirmation, the day-25 reminder, appeal acknowledgement, recovery decisions and support notifications should be connected during the dedicated support/notifications email configuration stage. Before enabling them, confirm the official support mailbox and verified sender identity. See `docs/SUPPORT_EMAIL_SETUP.md` for the existing Resend setup requirements. Do not place credentials in source control.
