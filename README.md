# Sophis Central Backend

[![Backend CI](https://github.com/ReignnRule11/sophia-central-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/ReignnRule11/sophia-central-backend/actions/workflows/ci.yml)

Sophis Central is an academic resource and research platform for students, lecturers, moderators, and administrators. This repository contains the NestJS API, PostgreSQL persistence, authentication/onboarding services, and backend integrations for the web client.

## Implemented product workflows

### Authentication and profile onboarding
The API includes email/password account entry points and provider-specific/social authentication routes. The frontend completes profile onboarding after registration or social sign-in.

Documented auth routes:
- `POST /auth/signup` — create an account with email/password.
- `POST /auth/login` — sign in with email/password.
- `POST /auth/social` — social provider sign-in/account-linking entry point.
- `POST /auth/google` — Google sign-in route.
- `POST /auth/apple` — Apple sign-in route.
- `POST /auth/onboarding` — complete the authenticated user's profile.
- `GET /auth/me` — retrieve the authenticated profile.

Provider routes require the corresponding provider configuration and must be verified in the deployment environment; route existence alone does not mean provider credentials or production OAuth configuration are present.

### Student profile
The onboarding/profile model supports academic details used by the student workflow, including:
- Institution
- Faculty
- Department
- Program
- Study level
- Bio and social profile fields where supported

### Lecturer profile
The onboarding/profile model supports lecturer academic details, including:
- Institution selection/verification data where supported
- Faculty
- Department
- Courses taught

Program and lecturer courses-taught persistence are backed by the migration and service/DTO updates introduced for the wireframe-alignment work. Apply pending migrations before deploying code that depends on these fields.

### Academic resources and moderation
The backend supports the API boundary used by the frontend's resource library, upload, and moderation workflows. The expected product flow is:

**Lecturer uploads resource → provides metadata → submits for review → resource is pending review → authorized moderator/admin reviews → resource is approved or rejected.**

Resource reads, uploads, ownership, and moderation actions must be protected by server-side authentication and role/permission checks. Student visibility should be limited to approved/verified resources according to the backend's actual resource policy.

### Academic Reviewer governance

Reviewer recruitment is closed by default. Set `REVIEWER_RECRUITMENT_OPEN=true` only when recruitment is intentionally opened. During a closed period, `REVIEWER_TEST_ACCOUNT_EMAIL` may allow one exact email to complete verified reviewer registration. The backend is authoritative; frontend visibility flags are not a security boundary.

`GLOBAL_ACADEMIC_REVIEWER_EMAIL` is a separate exact-email bootstrap setting and must use `sophiscentral+reviewer@gmail.com`. The existing Global Reviewer account is transferred in place by the platform-alias migration; its account ID, reviewer application history, assignments and resource-review records remain attached. The alias is distinct from the shared inbox address `sophiscentral@gmail.com`. Global Reviewer authority governs academic resource review and reviewer applications/assignments only; it does not grant Moderator, Support, Admin, wallet or platform-settings permissions.

The global reviewer application records that its evidence URL is a placeholder and does not represent a verified professional qualification. Self-review, co-author exclusion, conflict declarations, assignment audit events, and account suspension/revocation checks still apply.

### Other application areas
The frontend also includes AI tutor, wallet, analytics, and administration views. Availability of these capabilities depends on the corresponding backend endpoints, provider configuration, and authorization rules; do not infer a fully configured production integration from the presence of a frontend screen.

## Admin MFA

Administrator authentication requires a password followed by authenticator-app TOTP verification. An initial Admin without MFA receives a short-lived enrollment challenge instead of an authenticated session. Enrollment is confirmed with a valid six-digit code; the API then issues the Admin session and returns ten single-use recovery codes once.

- TOTP secrets are encrypted at rest with AES-256-GCM using `ADMIN_MFA_ENCRYPTION_KEY`.
- Configure a unique 32-byte encryption key as 64 hexadecimal characters in the deployment environment. Do not commit it or reuse `JWT_SECRET`.
- Login and enrollment challenges are encrypted, short-lived, and single-use, using Redis-backed replay protection.
- Recovery codes are stored as SHA-256 hashes and consumed once.
- Admin JWTs must contain the verified MFA claim; the JWT strategy rejects Admin tokens without it.
- MFA challenge, enrollment, and verification endpoints are rate-limited.

Routes:
- `POST /auth/login` — returns an Admin MFA challenge rather than a session for Admin accounts.
- `POST /auth/admin-mfa/enrollment/start` — returns the authenticator provisioning URI for an initial setup challenge.
- `POST /auth/admin-mfa/enrollment/confirm` — confirms enrollment, issues a session, and returns recovery codes once.
- `POST /auth/admin-mfa/verify` — completes login using TOTP or a recovery code.

Do not bootstrap the production Admin until the encryption key is configured and the complete enrollment/login/recovery flow has been tested in a non-production environment. Recovery/reset procedures must be owner-authorized and audited; there is no self-service MFA disable route.

If the Admin loses both their authenticator and all recovery codes, an authorized operator may use the offline `npm run admin:mfa-reset` command after migrations are applied. It requires `ADMIN_MFA_RESET_ENABLED=true`, exact email confirmation, operator email, and a reason of at least 30 characters. The command only resets the one existing Admin's MFA, records an immutable audit event with operator and reason, and forces fresh MFA enrollment at the next password login. It is not a public endpoint or self-service reset.

## Technology stack

- NestJS and TypeScript
- PostgreSQL and TypeORM
- Redis
- MinIO / S3-compatible object storage integration
- OpenAI-compatible AI provider integration
- Swagger/OpenAPI via NestJS Swagger

## Getting started

Requirements: a supported Node.js/npm version and Docker Compose for local dependencies.

```bash
git clone https://github.com/ReignnRule11/sophia-central-backend.git
cd sophia-central-backend
npm install
docker compose up -d postgres redis minio
cp .env.example .env
npm run start:dev
```

Fill in the required local environment values in `.env` before starting the API. Never commit real credentials or paste secrets into issues or chat.

## API documentation

When the server is running, Swagger is available at:

`/api/docs`

Use the deployed base URL plus `/api/docs` for the target environment if Swagger is enabled there.

## Database migrations and validation

Use the repository's migration process for schema changes. Do not use destructive schema reset commands against shared or production databases.

```bash
npm run build
npm test -- --runInBand
npm run migration:smoke
```

- `npm run build` compiles the NestJS application.
- `npm test -- --runInBand` runs Jest tests once in a serial process.
- `npm run migration:smoke` runs the database migration/schema smoke check and requires the database configuration expected by that script.
- `npm run migration:run` runs the compiled migration runner; build first and configure the target database safely.

Check the CI workflow for the exact checks configured for pull requests and production verification. A smoke test is meaningful only when run against the intended fresh/test database; never point it at production unless the workflow explicitly documents that operation as safe.

## Configuration and security notes

- Keep secrets in the deployment platform's secret/environment configuration, not in source control.
- Use a strong JWT/authentication secret and production-safe database credentials.
- Restrict CORS to trusted frontend origins.
- Use TLS for production API, database, and object-storage connections where supported.
- Ensure uploads have enforced size/type limits and private storage/access controls appropriate to the resource policy.
- Enforce role and ownership authorization on the server; frontend route guards are UX controls, not security controls.
- Configure Redis, object storage, and AI provider settings before enabling dependent production functionality.
- Run schema migrations as part of the controlled release process and verify rollback/recovery plans before production changes.

## Related repository

Web client and role-based user journeys: [ReignnRule11/Sophia-Central-frontend](https://github.com/ReignnRule11/Sophia-Central-frontend).

## Production readiness

The CI and production-verification workflows provide automated evidence for the checks they execute. Passing workflows do not, by themselves, prove that a live hosting environment has the right environment variables, external-provider setup, storage permissions, database migration state, or complete end-to-end user flows. Verify these independently after deployment.
