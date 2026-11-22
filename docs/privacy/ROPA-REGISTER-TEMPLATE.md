# Sophis Central — Record of Processing Activities (ROPA) Working Register

**Status:** Draft template seeded from repository features; not approved or complete.  
**Controller:** [LEGAL ENTITY / REGISTERED NAME — management to confirm]  
**Privacy contact:** [APPROVED CONTACT ADDRESS]  
**DPO/DPCO:** [NAME, QUALIFICATION, CONTACT — confirm applicability]  
**Review date:** [DATE]  
**Approver:** [MANAGEMENT / PRIVACY LEAD]

> Do not publish this working register as a factual privacy notice. Confirm every field against production configuration, contracts, actual workflows and data flows. Do not assume a feature is active merely because code exists.

## Processing activity register

| Activity | Data subjects | Data categories evidenced by product scope | Purpose | NDPA lawful basis (privacy lead to determine) | Source | Recipients/processors | Location / transfer | Retention | Security / access |
|---|---|---|---|---|---|---|---|---|---|
| Account registration and authentication | Students, lecturers, reviewers, platform staff | Name, email, password hash, academic handle, role, verification, session/security metadata | Account creation, authentication, account security | [DETERMINE PER PURPOSE] | User | [VERIFY PROD EMAIL/HOSTING/DB] | [VERIFY] | [APPROVE] | Password hashing, JWT, CSRF, role checks; verify implementation |
| Academic profile and institution catalogue | Students, lecturers, reviewers | Institution, faculty, department, programme, academic level, courses, bio, social/profile image | Academic identity and platform functionality | [DETERMINE] | User / approved catalogue | [VERIFY] | [VERIFY] | [APPROVE] | Account-level access; verify response minimisation |
| Resource contribution and moderation | Contributors, reviewers | Uploads, resource metadata, contributor/co-author handles, review decisions, conflict declarations | Submission, review, publication and integrity | [DETERMINE] | User | Hosting, DB, object storage, reviewers | [VERIFY] | [APPROVE] | Moderation status, assigned reviewer, storage controls |
| Resource browsing and personal library | Account holders | Saved/downloaded resource references and access logs | Deliver approved learning resources | [DETERMINE] | User / platform | Hosting, DB, object storage | [VERIFY] | [APPROVE] | Object-level authorization, signed URLs, reader controls |
| Messaging and presence | Students, lecturers | Sender/recipient IDs, academic handles, message content, group membership, timestamps, presence, attachments/voice | Private and group communication | [DETERMINE] | User | Hosting, DB, Redis, object storage | [VERIFY] | [APPROVE] | Membership and ownership checks, transport/storage controls |
| AI assistance | Students, lecturers | Prompts, generated outputs, files/context, usage and quota records | AI-assisted learning/research | [DETERMINE; assess contract necessity/consent where applicable] | User | [AI PROVIDER(S), subprocessors] | [VERIFY PROVIDER REGION / TRANSFERS] | [APPROVE WITH PROVIDER TERMS] | Quotas, account separation, provider settings; verify logs and training/retention terms |
| Support and escalation | Students, lecturers, Support, Moderator, Admin | Ticket text, contact details, attachments, status, responses, escalation history | Support, issue resolution and platform governance | [DETERMINE] | User / staff | Email, hosting, DB, storage | [VERIFY] | [APPROVE] | Role-restricted queues and audit trail; verify access |
| Referral, points, wallet and payments (if enabled) | Users, referrers, referred users, payees | Referral links, reward/points ledger, transaction and payout details | Reward, billing, reconciliation | [DETERMINE] | User / payment provider | [PAYMENT PROVIDERS / BANKS] | [VERIFY] | [APPROVE / STATUTORY] | Ledger integrity, idempotency, reconciliation |
| Notifications and service communications | Account holders | Notification content, destination, status | Service and security communications | [DETERMINE] | Platform events / user | Email and hosting providers | [VERIFY] | [APPROVE] | Authenticated account feed, provider controls |
| Security, analytics and diagnostics | Visitors and account holders | IP/device/session metadata, events, errors, logs | Security, reliability, abuse prevention, analytics | [DETERMINE; distinguish strictly necessary security logs from analytics] | Browser / app / infrastructure | Hosting, monitoring, analytics (if active) | [VERIFY] | [APPROVE] | Access restrictions, redaction, retention and log review |

## Required completion fields for every row

- Exact data fields collected and whether special-category or children's data may appear.
- Whether collection is mandatory or optional and consequences of not providing it.
- Purpose limitation and lawful basis separately for each purpose.
- Controller/processor role of each party.
- Recipients and sub-processors, including support access.
- Hosting and remote-access locations, transfer safeguards and transfer risk assessment.
- Retention trigger and approved period; backup expiry and legal-hold exceptions.
- Security measures, authorized roles and audit evidence.
- User notice location and rights handling route.
- Record owner, date verified and approver.

## Approval checklist

- [ ] Confirm legal controller identity and contact details.
- [ ] Verify active production features, including whether AI, analytics, payments and optional tracking are enabled.
- [ ] Export actual vendor/subprocessor list from production accounts and contracts.
- [ ] Verify database, object storage, email, monitoring, Redis and AI processing regions.
- [ ] Determine lawful basis with Nigerian privacy counsel/DPO.
- [ ] Approve retention schedule and deletion exceptions.
- [ ] Reconcile this register with Privacy Policy, Cookie Policy, DPIA and vendor contracts.
- [ ] Sign off by management and DPO/DPCO where applicable.
