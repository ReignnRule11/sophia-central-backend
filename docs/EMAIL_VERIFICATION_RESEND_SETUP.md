# Email verification with Resend

Email/password registration now creates an account in an unverified state and sends a single-use activation link. Login is blocked until the link is confirmed.

## Resend configuration

Keep the existing Resend API key. Configure these variables in the Render backend environment (do not commit their values):

- `RESEND_API_KEY`: existing Resend API key.
- `RESEND_FROM_EMAIL`: verified sender, preferably `Sophis Central <info@send.vinosta.com>`.
- `RESEND_EMAIL_VERIFICATION_TEMPLATE_ID`: ID of the new Resend email template described below.
- `FRONTEND_URL`: `https://sophiscentral.vercel.app`.
- `RESEND_TEMPLATE_ID`: keep the existing password-reset template ID unchanged.
- `PASSWORD_RESET_FROM_EMAIL`: can remain set during the transition; verification falls back to it if `RESEND_FROM_EMAIL` is not set.

The verification flow intentionally uses a separate Resend template ID from password reset. This avoids changing or breaking the existing password-reset email.

## Create the Resend template

In Resend, create and publish a template named **Sophis Central — Verify your email**. Use these exact template variables:

- `USER_FIRST_NAME`
- `VERIFY_URL`
- `EXPIRY_HOURS`

Suggested template copy:

**Subject:** Verify your email address — Sophis Central

**Heading:** Welcome to Sophis Central, {{USER_FIRST_NAME}}

**Body:** Thanks for creating your Sophis Central account. Before you sign in, confirm that this email address belongs to you by clicking the button below. This activation link expires in {{EXPIRY_HOURS}} hours. If you did not create this account, you can ignore this email.

**Button URL:** `{{VERIFY_URL}}`

Use the Resend template editor's variable syntax for the values above, and publish the template before copying its ID into Render.

## API flow

- `POST /auth/signup`: validates the basic registration fields and sends an email link containing an encrypted, 24-hour registration ticket. It does not create a user row or persist registration details.
- `POST /auth/email-verification/confirm`: accepts the ticket and password, verifies mailbox ownership, and returns a short-lived encrypted pre-account token. It does not create a user row or issue a signed-in session.
- `POST /auth/email-verification/resend`: accepts the original registration fields from the browser session and sends a replacement encrypted ticket. The response does not reveal whether an email already belongs to an account.
- `POST /auth/onboarding/complete`: accepts the pre-account token and required academic profile. Only this endpoint creates the user row, permanent Institution ID, account creation timestamp, and signed-in session.
- `POST /auth/login`: rejects email/password accounts until `emailVerified` is true. New accounts do not exist until onboarding is complete.

New registration and pre-account tickets are encrypted with AES-256-GCM, expire after 24 hours, and are not stored in PostgreSQL. Only SHA-256 digests of random, single-use ticket nonces are kept in Redis until their expiry; no registration fields are stored there. The password hash is carried only inside the encrypted pre-account ticket until final onboarding. Existing legacy verification tokens for already-created accounts remain SHA-256 hashed and are consumed through the compatibility path. The existing `isVerified` field remains separate and continues to represent the platform's existing account/academic verification state.

## Deployment

1. Merge and deploy the backend change.
2. Apply the new database migration through the existing production migration process.
3. Publish the Resend template and add its ID plus `RESEND_FROM_EMAIL` to Render.
4. Deploy the frontend verification page.
5. Test with a new email address: sign-up, receive email, open activation link, then sign in. Also test an expired token, resend cooldown, and that an existing account can still sign in.
