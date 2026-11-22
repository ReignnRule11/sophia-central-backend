# Initial Sophis Central Admin account bootstrap

The first Admin identity is created through a one-time backend command, not public registration and not the demo seed. The account is not usable until the mailbox owner follows the single-use verification link and sets a password.

## Preconditions

1. Review and merge the Admin bootstrap code and its database migration.
2. Confirm that the temporary Admin address `sophiscentral+admin@gmail.com` actually receives a Resend verification message. Gmail plus-addressing is not treated as verified until delivery is tested.
3. Confirm the intended database target before running any command. For production, verify the local environment points to the intended production Neon project/branch and database. Never paste database credentials into source control or chat.
4. Build the backend and apply the reviewed migrations to the intended database:
   - `npm run build`
   - `npm run migration:run`
5. Ensure the application has its required Redis and Resend verification-email configuration. The bootstrap command checks Redis and uses the existing email-verification template.

## One-time command

Set these environment variables only in the trusted shell/session used for the command:

- `ADMIN_BOOTSTRAP_ENABLED=true`
- `ADMIN_BOOTSTRAP_EMAIL=sophiscentral+admin@gmail.com`
- `ADMIN_BOOTSTRAP_CONFIRM_EMAIL=sophiscentral+admin@gmail.com`
- `ADMIN_BOOTSTRAP_FIRST_NAME=<Admin first name>`
- `ADMIN_BOOTSTRAP_LAST_NAME=<Admin last name>`

Then run:

```bash
npm run admin:bootstrap
```

The command:
- refuses to run unless explicitly enabled and both email confirmation values match;
- is restricted to the agreed temporary Admin login address;
- refuses to promote an existing non-Admin account or replace a different Admin;
- enforces one Admin account with a Postgres advisory lock;
- creates an email-unverified Admin record without a password;
- sends a 24-hour, single-use verification link;
- records bootstrap creation in the append-only Admin audit table;
- can be rerun only to resend verification for the same still-pending Admin identity.

The Admin sets their password on the existing Verify Email page. The backend then verifies the mailbox, hashes the password, activates the login and records the verification event. The command never prints the token or a password.

## After bootstrap

Unset the bootstrap environment variables immediately. Do not keep the command enabled as an application endpoint; it is a local/controlled CLI operation only. Sign in with the verified Admin email and the password set through the verification link.

If delivery fails, the pending Admin record remains unverified and cannot sign in. Fix the mail configuration and rerun the command to send a fresh link. Do not manually set `emailVerified` or create a second Admin account.

## Recovery and safety

- If a different Admin account already exists, stop and investigate; this script intentionally will not replace it.
- If the agreed Gmail alias does not receive mail, do not proceed with an unverified mailbox. Choose and confirm a working address first.
- Never commit the temporary environment variables, passwords, JWT secret, database credentials or verification token.
- Do not merge, deploy or run the production migration until the PR review and target-database checks are complete.
