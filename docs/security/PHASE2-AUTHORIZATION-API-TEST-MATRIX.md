# Sophis Central — Phase 2 Authorization and API Test Matrix

**Status:** Engineering test specification; not a completed penetration test.  
**Scope:** Backend controllers currently present on `main`. Confirm endpoint names against the deployed OpenAPI document before testing because route prefixes and deployment rewrites may differ.

## Test account set

Use dedicated synthetic accounts only:
- Student A and Student B (same institution; different faculty/department where possible).
- Lecturer A and Lecturer B.
- Reviewer with approved reviewer capability on a Student or Lecturer primary account.
- Existing Moderator account, both before and after Admin platform-role verification.
- Support account, both before and after Admin platform-role verification.
- Admin account.
- Suspended and deactivated variants for each relevant role.

Do not use production users' records or attempt destructive actions.

## Invariants to prove

1. Reviewer capability grants only reviewer workflow access. It must never grant Admin, Moderator, or Support access.
2. Moderator and Support routes require the matching primary role **and** Admin-approved `platformRoleVerifiedAt`.
3. Every request reloads the account from the database through JWT validation; client-side role labels and JWT role claims are not authority.
4. A user can only read, edit, delete, download, or sign a URL for records they are entitled to access.
5. State-changing cookie-authenticated requests fail without a matching CSRF cookie and header.
6. API responses omit password hashes, security-answer hashes, raw storage keys, private file URLs, and unrelated personal data.
7. Public catalogue metadata is distinct from authenticated file access; a public metadata endpoint must not make private object storage public.

## Controller-level test matrix

| Area | Routes / operations | Required negative tests |
|---|---|---|
| Authentication | login, signup, CSRF bootstrap, email verification, reset, onboarding, logout, `/auth/me` | malformed/expired JWT; unverified, suspended, deactivated and pending-deletion accounts; missing/mismatched CSRF on state-changing requests |
| Users | `GET /users`, management, platform accounts, `PATCH /users/:id`, reviewer access, platform role, status, deletion | Student/Lecturer cannot read another profile or update role/permissions; Reviewer cannot assign platform roles; Moderator cannot change Admin/Support/Moderator lifecycle; only Admin can approve Support/Moderator identity |
| Resources | public metadata, file URL, reader, saved/downloaded, own submissions, update/delete | change resource ID across accounts; pending/rejected resources; cross-institution access; reviewer only assigned pending review; no storage URL/key leakage |
| Upload | support attachment, presigned URL, completion, profile image, upload details | other user's resource/upload IDs; forged MIME, mismatched signatures, oversized body, expired/replayed upload; arbitrary profile-image key; private profile URL exposure |
| Moderation | queue, history, reviewer roster, assignments, conflict declaration, review | unassigned reviewer; revoked/suspended reviewer; self-assignment; conflict reviewer; Student/Lecturer access to unrelated review history; Reviewer attempting moderator-only work |
| Support | create, mine, queue, status, respond, escalate, email status | Student/Lecturer can only see own requests; Moderator cannot enter Support workspace; unverified Support denied; Support cannot administer users or resolve Admin-only escalations |
| Chat | inbox, contacts, group/direct history, send/edit/delete, read, block, retention, voice upload, SSE | non-member group access; arbitrary DM participant; edit/delete another sender's message; voice object key substitution; blocked-user bypass; unauthorized read receipts |
| AI | generation, sessions, usage and quotas | cross-account session ID; quota race/replay; prompt/file leakage across users; ensure provider error output omits secrets |
| Referral/points | referral creation, reward, wallet/transactions | self-referral, cross-role referral, duplicate reward, replay, deleted account reversal, negative balance, forged user ID |
| Payments | initialize, verify, webhook, payouts and reconciliation | amount/currency/user tampering; webhook signature/replay; verify another user's transaction; idempotency and concurrent replay |
| Notifications/analytics | user feed, admin send, lecturer/admin analytics | cross-user notification access; Reviewer/Moderator escalation to Admin; data minimisation in analytics |

## Safe execution procedure

For each case:
1. Record route, method, actor role/account, target record owner and expected result.
2. Capture a redacted request/response; never include cookies, bearer tokens, secrets or real personal data in the report.
3. Run one variable at a time using test records.
4. Confirm both the HTTP status and whether any side effect occurred.
5. Retest the same case after remediation.
6. Link evidence to a finding ID and record severity, owner and residual risk.

## Current source review observations (not runtime findings)

- `RolesGuard` checks reviewer capability independently from primary role and requires platform verification for Support/Moderator roles.
- `JwtStrategy` reloads the account from `UsersService` and rejects suspended, inactive and unverified accounts.
- A global `CsrfGuard` is registered in bootstrap; route-specific guards also appear on selected controllers. Verify the global guard is active in the deployed build and test every mutation.
- `securitySetup` enables credentialed CORS using exact configured origins and Helmet. The frontend `vercel.json` currently sets several security headers but does not set CSP. Helmet's default CSP is emitted by the API; the analyst's `style-src 'unsafe-inline'` observation should therefore be attributed to the exact response host/path before changing policy.
- The source review is not proof that object-level checks, storage policies, runtime CORS behaviour or API payload minimisation are correct. Those require service-level inspection and controlled requests.

## Exit criteria

Do not close Phase 2 until every applicable row has test evidence, all Critical/High findings are fixed or formally accepted, and regression tests pass. A passing CI run is not a substitute for the authorised live test.
