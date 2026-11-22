# Sophis Central — Data Retention and Deletion Schedule

**Status:** Proposed baseline for controller approval; not a statement of current production retention.  
**Owner:** Controller management with DPO/legal and engineering. **Version:** 1.0 — 22 November 2026.

## Principles
Retain personal data only as long as necessary for the stated purpose, a documented legal obligation, or establishment/exercise/defence of legal claims. The periods below are proposed operational starting points, not statutory periods unless expressly stated. Management and Nigerian counsel must approve each period after reviewing purpose, applicable limitation/accounting laws, user expectations and backup architecture.

Deletion means removal from active systems and processors where legally required. Backups may expire on a separate documented cycle; restrict access and reapply deletion instructions after restoration.

## Proposed schedule

| Category | Proposed trigger/period | Required action | Approval/evidence |
|---|---|---|---|
| Account/academic profile | While active; after verified closure, remove/anonymise within 30 days unless legal hold or other lawful retention applies | Delete profile, credentials, images and active identifiers; retain only justified minimum suppression/security record | Management/legal approve target; test all stores |
| Verification/reset tokens | Single use or expiry; remove expired tokens within 24 hours where feasible | Delete token records; never log plaintext tokens | Engineering verify TTL/cleanup |
| Sessions/auth artifacts | Session lifetime/revocation policy | Revoke server-side sessions/tokens where implemented; expire cookies | Engineering document actual model |
| Academic uploads/resources | While published/needed; on valid takedown/removal decision restrict/remove promptly; document legal hold | Delete object, metadata and cached copies; preserve only necessary moderation/legal evidence | Product/legal define lifecycle/appeals |
| Moderation/reviewer decisions | Proposed 24 months after final decision, then delete/anonymise unless dispute/legal hold | Restrict audit trail access | Legal approval; not statutory period |
| Personal library | While account active; remove on closure/request unless justified otherwise | Delete references and derived indexes | Engineering verify |
| Private/group messages | Proposed 24 months after message creation or account closure where feasible; shared-message rights assessed case by case | Delete eligible content/voice; retain minimal justified safety/audit metadata | Product/legal decision required |
| Voice/attachments | Same as parent message/resource; orphan objects proposed cleanup within 30 days | Delete object/replicas; invalidate signed URLs | Engineering/storage evidence |
| AI prompts/outputs | Do not retain beyond delivery unless user history is explicit; proposed history while account active and closure deletion within 30 days | Delete platform copies; request provider deletion where available; record provider exceptions | Confirm provider terms/settings |
| Support tickets/attachments | Proposed 24 months after closure, unless unresolved dispute/legal claim | Delete attachments/unneeded identifiers; restrict access | Support owner/legal approval |
| Security/access logs | Proposed 12 months, subject to risk-based need; incident evidence may be held separately | Rotate/delete; redact where feasible | Security/DPO approval; verify Render/Sentry/Vercel/Neon |
| Payment/accounting records | Period required by tax/accounting/other law; period to be confirmed | Retain only required transaction fields; do not store full card credentials | Legal/accounting approval |
| Referral/points ledger | While needed for rewards/disputes; proposed 24 months after closure subject to accounting/legal hold | Pseudonymise where feasible; separate mandatory financial records | Finance/legal approval |
| Email delivery logs | Proposed 90 days unless security/dispute need | Delete/expire provider logs where configurable | Resend terms/settings |
| Redis presence/cache | Ephemeral; proposed TTL no more than 24 hours unless documented need | Expire keys; do not use cache as untracked durable message store | Engineering verify TTL/persistence |
| Sentry events | Proposed 90 days for ordinary events; incident evidence under restricted legal hold | Scrub PII and expire events/attachments | Verify plan, region and retention |
| Backups | Proposed rolling maximum 35 days, subject to actual provider capability | Automatic expiry; record expiry; reapply deletion after restore | Confirm Neon/Render/R2 backup schedules |

## Deletion workflow
1. Authenticate request and identify scope.
2. Check legal hold, accounting, safety and third-party rights.
3. Map stores using ROPA/vendor register.
4. Approve technical plan through privacy owner; Support must not directly manipulate production DB.
5. Delete/anonymise active DB records, objects, indexes, caches and provider copies where required.
6. Notify processors and record acknowledgements/limitations.
7. Record backup expiry and ensure restored backups do not reintroduce deleted data into active use.
8. Respond with completed actions and lawful exceptions.
9. Close only when evidence is retained.

## Implementation evidence required
Database deletion jobs/tests; object lifecycle/orphan cleanup; Redis TTL/persistence; Groq/Gemini and other active AI retention/deletion settings; Resend/Sentry/Vercel/Render/Neon log and backup settings; synthetic account closure/erasure test; restricted legal-hold register.

No period is final until controller approval. Management: __________ Date: ___; DPO/DPCO/legal: __________ Date: ___; Engineering: __________ Date: ___.
