# Sophis Central Support Email Setup

The Support module now has a configuration-ready outbound email integration using Resend. It remains optional until the dedicated support mailbox and verified sender identity are supplied.

## Required hosting environment variables

Set these in the backend hosting environment (Render), not in source control:

- `RESEND_API_KEY`: Resend API key with permission to send from the verified domain.
- `SUPPORT_EMAIL`: Dedicated mailbox that receives new support-request alerts and is used as the reply-to address for user acknowledgements/resolution emails.
- `SUPPORT_FROM_EMAIL`: Verified sender identity, for example `Sophis Central Support <support@your-verified-domain>`.
- `FRONTEND_URL`: Production frontend origin, currently `https://sophiscentral.vercel.app`.

Do not add secret values to this document, commits, screenshots, or chat messages.

## Current behaviour

1. A student or lecturer submits a support request in Sophis Central.
2. The request is persisted first.
3. The moderator account receives an in-app notification.
4. When email settings are configured, Resend sends an alert to the dedicated support mailbox and an acknowledgement to the requester.
5. When a moderator concludes a request, the requester receives an in-app notification and, when configured, an email containing the resolution.
6. Email provider failure does not undo a saved ticket or prevent a moderator from handling it in the Support page.
7. Moderator-only endpoint `GET /moderation/support-email-status` reports whether the outbound email configuration is present. It does not expose credentials.

## Before enabling production delivery

- Verify the sending domain in Resend and configure its required DNS records.
- Choose the final dedicated Support mailbox and verify it can receive messages.
- Set the four environment variables in Render.
- Confirm the sender identity is authorized by Resend.
- Submit a test request using a non-production test account and verify both the team alert and user acknowledgement.
- Conclude the test ticket and verify the resolution email.
- Confirm delivery logs in Resend and backend logs without exposing message contents or secrets.

## Not included yet

Inbound email reply synchronization is not enabled in this foundation. Replies sent directly to the support mailbox will not automatically become ticket messages until a verified inbound-email/webhook workflow is implemented. The existing in-app Support request and resolution history remains the source of truth in the meantime.
