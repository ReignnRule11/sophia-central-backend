# Sophis Central — Security and NDPA/GAID Assessment Plan

**Status:** Working assessment and remediation register  
**Last reviewed:** 21 November 2026  
**Scope:** Sophis Central web application, API, storage integrations, operational processing and privacy governance.

> This document is an assessment plan and evidence register, not a declaration of NDPA compliance or a penetration-test certificate. Items marked pending require production evidence, controlled testing or review by a qualified Nigerian data-protection professional.

## 1. Applicable framework

Assess the platform against:
- Nigeria Data Protection Act 2023 (NDPA).
- Nigeria Data Protection Commission General Application and Implementation Directive 2025 (GAID), including applicable schedules.
- Relevant OWASP Web Security Testing Guide, OWASP ASVS and OWASP API Security Top 10 as technical testing references.

Confirm current legal interpretation, applicability, registration category and deadlines with qualified Nigerian privacy counsel or an appropriately certified DPO/DPCO.

## 2. Technical penetration-testing scope

Testing must be authorised, non-destructive and performed against a documented target list with dedicated test accounts and synthetic data. No testing of real users' private data, destructive load tests, credential stuffing, persistence, or denial-of-service activity.

| Area | Required tests | Suggested tools |
|---|---|---|
| Authentication/session | Login, registration, reset, verification, session expiry/revocation, cookie flags, CSRF | Burp Suite, OWASP ZAP |
| Authorization | Horizontal/vertical access, IDOR/BOLA, role changes, reviewer/moderator/support/admin boundaries | Burp Repeater, Autorize, manual role matrix |
| API | Object/property authorization, mass assignment, excessive data exposure, rate limiting, error handling | Burp Suite, Postman, ZAP |
| Resources/storage | Private resource authorization, signed URL expiry, bucket policy, reader endpoints, upload validation | Burp, AWS CLI/R2 S3-compatible tooling |
| Messaging | DM/group membership checks, message ownership, attachments and voice object authorization | Burp Suite, dedicated accounts |
| Business logic | Referral reward replay, wallet/credit invariants, AI quotas, support/escalation and approval workflows | Manual test cases, Postman/Burp |
| Injection/browser | XSS, SQL/NoSQL injection where applicable, SSRF, path traversal, file parsing | Burp, ZAP, safe test payloads |
| Infrastructure | CORS, CSP, HSTS, TLS, exposed services, secrets and dependency risks | Nmap (approved hosts only), testssl.sh, Mozilla Observatory, Trivy, Dependabot |

Record for every finding: unique ID, severity, affected asset/endpoint, preconditions, reproducible steps, redacted request/response evidence, impact, remediation, retest result and residual risk.

### Phase 1 observations requiring follow-up

- Cookie notice acknowledgement persistence after first interaction, login and route changes.
- CSP style-src unsafe-inline: identify the header source and determine whether inline styles can be removed or safely constrained. Treat as defense-in-depth unless exploitability is demonstrated.
- CORS: verify disallowed origins receive no credentialed CORS permission and are not reflected in Access-Control-Allow-Origin.
- Authenticated API responses: inspect actual payloads for unnecessary personal, internal or security-sensitive fields.
- Re-test /api/auth/me, /api/chat/inbox and restricted endpoints across all account roles.
- Verify missing, invalid and mismatched CSRF tokens are rejected on all state-changing browser endpoints.
- Include the analyst's Linux testing results in the final report.

## 3. NDPA/GAID workstream

### 3.1 Personal data inventory and Record of Processing Activities (ROPA)
Create an inventory for:
- Account identity, contact, academic institution/faculty/department and role data.
- Academic uploads, resources, moderation/review records and document metadata.
- Private/group messages, attachments and voice messages.
- AI prompts, uploaded context and generated outputs.
- Support requests, attachments and escalation records.
- Wallet/referral/payment/payout records, if enabled.
- Device, IP, session, security, audit and diagnostic logs.

For every activity document purpose, data subjects, categories, lawful basis, source, recipients/processors, storage/transfer location, retention period, security controls and user-facing notice.

### 3.2 Transparency and lawful basis
- Map each processing purpose to an applicable NDPA lawful basis; do not use blanket consent as a default.
- Provide collection-time notices and identify controller contact details.
- Explain purposes, recipients, retention, rights, complaints and relevant transfers.
- Ensure cookie notice acknowledgement is not treated as consent to optional tracking.

### 3.3 Data subject rights
Document and test intake, identity verification, triage, response, extension/refusal reasoning and request logs for access, correction, erasure where applicable, restriction, objection, portability where applicable and consent withdrawal where consent is the basis.

### 3.4 Retention and deletion
Create a schedule by data category and legal/business purpose. Define deletion, anonymisation, backup expiry, legal holds and account-closure handling. Do not invent retention periods; obtain owner/legal approval for each schedule.

### 3.5 Processors and international transfers
Maintain a vendor/subprocessor register covering hosting, database, object storage, email, monitoring, payments, AI and support tools. Collect executed DPAs, security terms, subprocessors, processing locations, transfer mechanism/safeguards, deletion terms and incident-notification commitments. Verify actual production settings and contracts.

### 3.6 AI and DPIA
Prepare a Data Protection Impact Assessment using the applicable GAID Schedule 4 framework. Assess student/educational records, AI prompts/files, profiling or automated decisions, provider retention/training, cross-border processing, access controls, human review, risks and mitigations. Obtain review by a suitably qualified/certified DPO and involve the DPCO/NDPC where required.

### 3.7 Governance and breach response
- Determine whether the organisation is a data controller/processor of major importance and whether NDPC registration/audit obligations apply.
- Confirm DPO appointment and responsibilities where required.
- Establish incident classification, evidence preservation, containment, risk assessment, escalation and notification workflows.
- Support NDPC notification within the applicable statutory 72-hour period when the legal threshold is met, and data-subject notification where required.
- Maintain training, policies, access reviews, processor oversight and audit evidence.

## 4. Evidence required from the organisation

The engineering repository cannot establish these facts. Obtain and verify:
1. Legal controller identity, address and privacy contact.
2. Active production vendors, services, subprocessors and signed DPAs.
3. Actual data hosting/processing locations and international transfer safeguards.
4. AI provider terms, retention settings and model-training settings.
5. DPO/DPCO details and NDPC registration status/category, if applicable.
6. Approved retention schedule and legal holds.
7. Operational data-subject request and breach-response procedures.
8. Age eligibility and handling of children/minors.
9. Approved ROPA and DPIA.

## 5. Exit criteria

Do not mark the project complete until:
- All critical/high technical findings are fixed or formally risk-accepted with compensating controls.
- Retests demonstrate the fixes.
- ROPA and DPIA are approved and match production processing.
- Vendor/transfer safeguards and retention schedules are evidenced.
- User rights and breach-response workflows are tested.
- Applicable DPO, DPCO, registration and audit obligations are confirmed by qualified review.
- Privacy and cookie notices match actual production behaviour.

## 6. Remediation register

| ID | Action | Owner | Status |
|---|---|---|---|
| SEC-01 | Cookie notice persistence across login/navigation | Engineering | Implemented in frontend PR; runtime retest pending |
| SEC-02 | Identify CSP source and assess unsafe-inline removal | Engineering/security analyst | Pending |
| SEC-03 | CORS negative tests with credentials | Security analyst | Pending |
| SEC-04 | Authenticated API payload minimisation review | Engineering/security analyst | Pending |
| SEC-05 | Cross-role RBAC, IDOR, CSRF, resources, messaging and business-logic Phase 2 | Security analyst | Pending |
| PRIV-01 | ROPA and lawful-basis mapping | Privacy lead/DPO | Pending |
| PRIV-02 | Data subject rights workflow verification | Engineering + privacy lead | Pending |
| PRIV-03 | Retention/deletion schedule and implementation | Engineering + privacy lead | Pending |
| PRIV-04 | Vendor, DPA and international transfer register | Privacy lead/procurement | Pending |
| PRIV-05 | Educational/AI DPIA and review | DPO/DPCO + engineering | Pending |
| PRIV-06 | Breach response, DPO and NDPC registration applicability | Management + DPO/legal | Pending |
