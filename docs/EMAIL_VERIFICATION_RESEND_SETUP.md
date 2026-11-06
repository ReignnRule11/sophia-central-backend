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

- `POST /auth/signup`: creates an account, stores a hashed activation token, and sends the activation email. It does not issue an access token or authentication cookies.
- `POST /auth/email-verification/confirm`: accepts `{ "token": "..." }`, verifies the email, and consumes the token.
- `POST /auth/email-verification/resend`: accepts `{ "email": "..." }`; the response does not reveal whether the account exists. Resends are limited to one per minute per unverified account.
- `POST /auth/login`: rejects email/password accounts until `emailVerified` is true.

Activation tokens are stored as SHA-256 hashes, expire after 24 hours, and are replaced when a new activation email is issued. Existing accounts are marked email-verified by the migration so current users are not locked out. The existing `isVerified` field remains separate and continues to represent the platform's existing account/academic verification state.

## Deployment

1. Merge and deploy the backend change.
2. Apply the new database migration through the existing production migration process.
3. Publish the Resend template and add its ID plus `RESEND_FROM_EMAIL` to Render.
4. Deploy the frontend verification page.
5. Test with a new email address: sign-up, receive email, open activation link, then sign in. Also test an expired token, resend cooldown, and that an existing account can still sign in.
