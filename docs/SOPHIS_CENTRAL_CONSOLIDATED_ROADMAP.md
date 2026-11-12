# Sophis Central — Consolidated Development Roadmap

## Purpose

Translate the business requirements into an implementation sequence for the existing React/Vite frontend and NestJS/PostgreSQL backend. The backend remains authoritative for pricing, moderation, wallet balances, access grants, payouts, role permissions, identity and project outcomes.

## Scope boundaries

### Build now
1. Lecturer material pricing: free, fixed (approved price list capped at ₦3,000), and custom (held for administrative approval).
2. Lecturer material checkout and immutable 70:30 revenue allocation after verified successful payment.
3. Wisdom Points wallet and paid top-ups; research-material unlocks cost 2 points and expire after 14 days.
4. Academic content review, including custom-price decisions and reviewer permissions.
5. Three-year update reminders based on substantive version updates. Reminders never change publication status, access or revenue eligibility.
6. Lecturer account-closure requests routed to administrators; no self-service permanent deletion.
7. Restricted freelancer marketplace with fixed displayed compensation, competitive bids for selection (not price offers), milestones/revisions and auditable outcomes.
8. Unique student/lecturer IDs generated at account creation and visible in profile.

### Explicitly defer
- Finance operations dashboard (after the buildathon).
- Wisdom Points redemption for paid lecturer materials.
- Wisdom Points gifting.
- Public jobs, internships and employment placement.

## Existing capabilities to reuse

- Resource moderation and decision history already exist.
- Resource ownership, private file URLs, presigned object storage and a student points wallet already exist.
- Notification persistence already exists.
- Existing auth/session and role guards remain the access-control foundation.
- The existing PostgreSQL migration runner is the only supported production schema-change path.

## Delivery phases

### Phase 1 — Identity and commercial data foundation
- Stable unique IDs for students and lecturers.
- Resource pricing fields and custom-price review state.
- Last substantive update timestamp, distinct from generic updatedAt.
- Migration and smoke assertions.
- Profile display/copy and server-side verification will follow as a separate API/UI slice.

### Phase 2 — Lecturer material commerce
- Explicit pricing DTO validation and lecturer-owned resource updates.
- Custom-price review queue, decision notes and lecturer notifications.
- Payment-provider abstraction with idempotent webhook processing.
- Ledger entries for gross amount, platform 30%, lecturer 70%, fees/refunds and payout state.
- Never credit earnings from a client-side success redirect. Only verified provider events can settle a purchase.
- Free resources never create a purchase or revenue-share ledger entry.

### Phase 3 — Wisdom Points research access
- Separate point purchase ledger and payment webhook.
- Configurable packages; Starter ₦500/40 points and top tier ₦5,000/100 points are proposals pending approval.
- Keep the ₦25/point reference value configurable; proposed packages imply different effective rates and need business sign-off.
- Research unlocks only: debit 2 points atomically with a 14-day entitlement. Re-unlock after expiry costs 2 again.
- Paid lecturer resources are not purchasable with points in this release.
- Preserve earned/referral point history and prevent double spending under concurrent requests.

### Phase 4 — Academic quality and lifecycle
- Subject-matter reviewer assignments and audit trail.
- Review custom pricing alongside material quality.
- Material version history and substantive-update tracking.
- Scheduled reminders at three years and recurring reminder policy; reminder state is informational only and never changes access or status.

### Phase 5 — Account administration
- Contact Admin page with approved email, WhatsApp and scheduling destinations supplied by the business.
- Account closure request workflow, identity verification, financial/material checks, administrator approval and status notifications.
- Remove self-service deletion from lecturer UI; retain privileged deletion only where legally and operationally approved.

### Phase 6 — Freelancer Career marketplace
- Application/onboarding and approval for freelancers.
- Professional profiles, verified credentials and skill categories.
- Client request intake, scope and fixed freelancer compensation set by Sophis Central.
- Private project board; qualified freelancers submit interest/approach/availability, not a competing fee.
- Bid evaluation and award audit trail.
- Submission, review, revision, approval, client delivery and payment states.
- Performance metrics calculated from verified outcomes; disputed feedback can be reviewed.
- Fair-access controls and eligibility rules prevent ratings from becoming the sole allocation mechanism.

### Phase 7 — Financial operations (after buildathon)
- Finance dashboard, reconciliation, payout monitoring, reporting and exception handling.

## Security and correctness decisions

- A unique user ID is an identifier, not a secret or a replacement for authentication. It can be required as an additional account-match confirmation, but sensitive operations still require an authenticated session and, where appropriate, re-authentication or a one-time challenge. Do not use the ID alone to unlock a downloaded file.
- A downloaded file cannot be protected after it leaves the platform unless it is opened in a controlled reader or protected file format. The enforceable control is server-authorized access/download and in-app viewing.
- Payment state and revenue allocation are server-side and idempotent. Provider webhook signatures must be verified. Refunds and chargebacks require compensating ledger entries rather than editing historical transactions.
- Point debits and entitlement creation must be one database transaction with row locking/atomic balance updates.
- Custom-priced resources stay unavailable for sale until approved. Academic approval and custom-price approval are distinct decisions.
- Three-year reminders must not alter moderationStatus, visibility, checkout eligibility or lecturer revenue.
- Freelancer ratings use accepted work, deadlines, correction severity and verified feedback. Raw project counts alone are not a quality score.
- Research services must comply with client confidentiality, research ethics, data protection and institutional rules; the marketplace must not facilitate plagiarism or dishonest academic submissions.

## Business decisions required before production payments

1. Choose the payment provider (for example, Paystack or Flutterwave) and provide production credentials through deployment secrets, never source code or chat.
2. Approve the fixed-price dropdown values up to ₦3,000.
3. Confirm Wisdom Points package prices/quantities. Current Starter and Highest Tier proposals do not both equal ₦25 per point.
4. Define lecturer payout cadence, minimum payout, bank-account verification, fees, tax handling, refund/chargeback treatment and who funds refunds.
5. Supply official support email, WhatsApp number and scheduling destination.
6. Define subject-matter reviewer eligibility and freelancer verification requirements.

## Release acceptance criteria

- Migrations apply cleanly to a fresh test database and an existing database without destructive resets.
- Role/ownership checks are enforced by the API, not only the frontend.
- Money and point movements are idempotent and auditable.
- No paid resource can be purchased before its required approvals.
- Free resources generate zero purchase revenue.
- A 14-day entitlement expires at the exact stored timestamp and can be renewed by a new 2-point debit.
- Three-year reminders do not change resource visibility or payment eligibility.
- Account deletion is an explicit admin workflow and preserves financial audit records as required.
- Marketplace award, revision, acceptance and payout records are attributable and auditable.
- Production deployment and live provider/storage/database verification are reported separately from CI success.