# Sophis Central email configuration follow-up

Use this checklist when the support mailbox and notification email work is scheduled. Do not commit API keys or mailbox credentials.

## Existing Resend integrations

### Password reset
- Environment: `RESEND_API_KEY`, `PASSWORD_RESET_FROM_EMAIL`, `FRONTEND_URL`, `RESEND_TEMPLATE_ID`.
- Existing sender correction: display name should be **Sophis Central**; sender address is `info@send.vinosta.com`.
- Existing Resend template ID: `a2eaee88-c74e-435c-a606-d2ebfd74ca0b`.
- Template variables: `USER_FIRST_NAME`, `EXPIRY_MINUTES` (30), `RESET_URL`.
- Template branding correction: use the Sophis Central logo/icon, not the Vinosta logo.

### Email verification
- Environment: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (falls back to `PASSWORD_RESET_FROM_EMAIL`), `FRONTEND_URL`, `RESEND_EMAIL_VERIFICATION_TEMPLATE_ID`.
- Template variables: `USER_FIRST_NAME`, `VERIFY_URL`, `EXPIRY_HOURS` (24).
- Confirm sender-domain verification and the correct Sophis Central branding.

## Support mailbox and support notifications
- Environment: `SUPPORT_EMAIL`, `SUPPORT_FROM_EMAIL`, `RESEND_API_KEY`, `FRONTEND_URL`.
- Confirm the official Sophis Support mailbox and verified sender identity.
- Existing support integration emails new support tickets to the support mailbox, acknowledges receipt to the user and sends resolution emails.
- Inbound reply synchronization is currently not implemented; decide whether replies should remain email-only or be synchronized into the platform.

## New account-lifecycle emails to implement
- Deletion-request confirmation with the exact scheduled purge date and cancellation instructions.
- Reminder around day 25 of the 30-day grace period.
- Deletion-cancellation confirmation.
- Verified security-question reset process for users who forget their answer.
- User deactivation and reactivation notices where appropriate.
- Moderator suspension/reactivation notices.
- Recovery-appeal acknowledgement, verification request and final decision.

## Deleted-account recovery policy decision
Before enabling post-purge recovery appeals, decide whether Sophis Central will keep a separate encrypted recovery archive after the 30-day grace period. Recommended starting point: a 14-day post-purge archive window, isolated from the live database, with access restricted to authorized support/admin staff and automatic expiry. If no archive is retained, support can accept appeals but cannot restore the permanently purged account; the user would need to register again.

## Verification before launch
- Test password-reset and email-verification templates end to end.
- Test support ticket notification, user acknowledgement and resolution email.
- Test lifecycle notices and delivery failures.
- Verify sender names, reply-to behaviour, links, expiry times, logo and mobile rendering.
- Keep all secrets in Render environment settings and never in Git.
