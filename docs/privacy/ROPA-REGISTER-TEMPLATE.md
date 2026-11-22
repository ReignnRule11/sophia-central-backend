# Sophis Central — Record of Processing Activities (ROPA)

**Status:** Populated working ROPA based on known product scope and repository configuration. Not management-approved and not a certification of production settings.  
**Controller legal identity/address:** Management must confirm the actual legal person operating Sophis Central. Do not infer this from the Vinosta brand, domain or email sender.  
**Privacy contact / DPO:** To be appointed/confirmed and published.  
**Version:** 1.0 — 22 November 2026.

## 1. Scope and controller role

Sophis Central is an online academic community and learning-support platform initially serving Nigerian tertiary-education users. Known product areas include student/lecturer accounts, academic profiles, resource contribution and moderation, personal libraries, private/group messaging, AI assistance, support/escalation, platform administration, referrals/rewards and service/security communications.

The controller is the legal person that determines purposes and essential means. Hosting providers, developers, parent brands and email senders are not automatically the controller. Management must identify the controller and assess whether any party is a joint controller.

## 2. Processing register

| ID / activity | Data subjects and data | Purpose/source | Candidate lawful basis — confirm per purpose | Recipients/systems | Location, retention and safeguards |
|---|---|---|---|---|---|
| P01 Account/authentication | Students, lecturers, reviewers, staff; name, email, academic handle, password hash, role, verification, session/security events | Create, authenticate and secure accounts; user input/events | Contract or pre-contract steps for core service; legitimate interests for proportionate security only after LIA | Backend, database, Resend email, hosting/CDN, Sentry diagnostics where configured | Render, Neon, Vercel and Resend are known project services. Verify regions/log retention. Retain while active; approve closure schedule. Hashing, cookies, CSRF and server-side role checks require production evidence. |
| P02 Academic profile/catalogue | Students/lecturers; institution, faculty, department, programme, level, courses, bio, academic handle, profile image, optional social fields | Academic identity/discovery; user and catalogue input | Contract for requested profile features; optional public fields may need consent; LIA for abuse prevention | API/database, object storage/CDN | Confirm public/private visibility, exact fields and deletion. Minimise public responses. |
| P03 Resource contribution/moderation | Contributors, co-authors, reviewers; documents, metadata, course tags, handles, authorship/conflict declarations, decisions and timestamps | Submit, review, publish and maintain integrity | Contract for contribution; LIA for moderation/integrity after balancing; legal claims where applicable | API/database, object storage, authorized reviewers/moderators/admins | Cloudflare R2 S3-compatible storage is known from project context; verify account/region, ACLs, signed URL expiry and lifecycle. |
| P04 Resource access/library | Students/lecturers; resource IDs, saved/downloaded references, access events | Deliver learning resources and maintain library | Contract; LIA for proportionate security logs | API/database, object storage/CDN | Per-account object authorization; define retention for library references and access logs. |
| P05 Messaging/presence/voice | Students/lecturers; sender/recipient IDs, handles, message text, group membership, timestamps, edits/deletions, presence, voice/attachments | Private and institution/faculty/department group communication | Contract for requested messaging; LIA for security/abuse reporting | API/database, Redis, object storage, hosting/CDN | Redis presence/pub-sub and object storage are known. Verify regions, TTL, backups and deletion. Test group membership and DM participant isolation. |
| P06 AI assistance | Students/lecturers; prompts, selected files/context, outputs, provider request metadata, usage/quota records | User-requested learning/research assistance | Contract only where objectively necessary for expressly requested AI; consent may be needed for optional/sensitive processing; LIA only for separate limited security purposes after LIA | Groq primary and Gemini fallback appear in environment example; OpenAI/Anthropic/Azure/Llama adapters exist in source but activation is unconfirmed | Confirm actual providers/models, terms, subprocessors, region, retention, training and human review. Treat as potential cross-border transfer until evidenced. |
| P07 Support/moderation/admin | Users/staff; ticket content, contact details, attachments, escalation history, reports, role approvals and audit events | Resolve support, investigate abuse and operate platform | Contract for requested support; LIA for platform safety after LIA; legal claims/obligations where applicable | API/database, object storage, Resend/email, authorized staff accounts | Verify role/API enforcement, staff access logs, and retention. Support, Moderator and Admin must have distinct least-privilege duties. |
| P08 Referral/rewards/payments | Users/referrers/payees; referral IDs, points ledger, transaction/payment status and payout details if enabled | Administer rewards, paid packages and reconciliation | Contract for paid/reward service; legal obligation for accounting; LIA for fraud prevention after LIA | Database; Paystack/Flutterwave options appear in environment example; active provider unconfirmed | Confirm active payment provider, exact fields, processor terms, location and statutory retention. Do not store full card credentials. |
| P09 Service/security email | Account holders; email, template content, verification/reset/support events, delivery metadata | Verification, reset and service/security communications | Contract/security necessity; legal obligation for mandatory notices | Resend is configured; sender/domain and routing require production confirmation | Verify region, logs, support access and retention. Never log plaintext reset tokens. |
| P10 Security/diagnostics | Visitors/account holders; IP, user-agent/device metadata, request/error traces, auth/rate-limit/audit events | Security, troubleshooting, abuse prevention and reliability | LIA with documented necessity/balancing test; legal obligation only where specific | Render, Vercel, Neon, Redis, Sentry and CDN logs as enabled | Verify exact fields, redaction, access, region and TTL. No analytics/advertising provider is assumed active; inspect deployed scripts/cookies. |
| P11 Cookies/site storage | Visitors; essential session/security cookies and optional analytics/marketing identifiers only if present | Deliver site, secure sessions and remember choices; optional analytics only if enabled | Applicable basis for essential processing; valid consent for non-essential tracking where GAID Art.19 requires | Vercel/CDN, backend and any verified analytics vendor | Inventory actual cookies, local storage and scripts. A cookie acknowledgement is not consent to optional tracking. |

## 3. Sensitive data, children and vulnerable users

The platform targets tertiary education but must not assume every user is an adult. Users may voluntarily include health, disability, religion, political opinions, biometrics or other sensitive data in profiles, messages, support tickets, uploads or AI prompts. These are not intended collection fields. Discourage unnecessary submission, restrict access and obtain legal assessment under NDPA ss.30–31 if sensitive data or children/persons lacking capacity are in scope. Product must confirm minimum age and onboarding controls.

## 4. Rights and transparency

Publish the controller identity and privacy contact. At collection, explain purposes, lawful bases, recipients, retention, international transfers, rights, complaints and AI processing. Support access, rectification, objection, erasure subject to exceptions, portability where statutory conditions apply, and consent withdrawal where consent is the basis. Do not use blanket consent for necessary contract/security processing.

## 5. Retention, vendors and transfers

See DATA-RETENTION-AND-DELETION-SCHEDULE.md and VENDOR-PROCESSOR-AND-TRANSFER-REGISTER.md. The schedule is proposed, not an existing production setting. Vendor names are known from project configuration/context; legal entities, account owners, regions, subprocessors, contracts and transfer mechanisms remain evidence items. Assess transfers under NDPA ss.41–43 and GAID Art.45/Schedule 5.

## 6. Security evidence

Known components include password hashing, JWT/session cookies, CSRF protection, role guards, reviewer privilege separation, resource access controls, Redis presence, object storage, Sentry and automated CI/security checks. These do not prove endpoint-level security. Retain evidence for encryption, secrets, least privilege, access reviews, logging, backups/restore, vulnerability management, secure development and incident response.

## 7. Required approvals

| Decision | Owner | Status |
|---|---|---|
| Controller legal identity, address and privacy contact | Management/legal | OPEN |
| Verify production features and exact data fields | Engineering/product | OPEN |
| Approve lawful basis per purpose and Schedule 8 LIA where needed | DPO/DPCO/legal | OPEN |
| Confirm age eligibility and sensitive-data handling | Product + DPO | OPEN |
| Confirm vendors, DPAs, regions, subprocessors and transfer grounds | Procurement/privacy | OPEN |
| Approve retention schedule and implement deletion | Management + engineering + legal | OPEN |
| Determine DCPMI category, registration/CAR and DPO obligations | DPO/DPCO/legal | OPEN |
| Approve ROPA and align privacy notices | Controller management | OPEN |

**Controller approval:** __________________ Date: ______  
**DPO/DPCO review:** __________________ Date: ______

Update this ROPA before or promptly after a new purpose, data category, AI provider/model, analytics/payment tool, recipient, location, retention rule or material access-control change.
