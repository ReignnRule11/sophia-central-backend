# Sophis Central — NDPA 2023 / GAID 2025 Compliance and Security Assessment Plan

**Status:** Consolidated workplan/evidence register; not a compliance certificate, legal opinion, NDPC registration confirmation or penetration-test report.  
**Updated:** 22 November 2026.

## 1. Applicable framework

Nigeria Data Protection Act 2023, including ss.24–31 (principles, lawful basis, transparency, DPIA, processors, sensitive data and children), ss.32–33 (DPO/compliance services), ss.34–38 (rights/automated decisions), ss.39–40 (security/breaches), ss.41–43 (cross-border transfers), ss.44–45 (DCPMI registration/fees) and s.48 (enforcement).

NDPC GAID 2025, including Articles 7–14 (governance, DCPMI, CAR, DPO), 15–27 (principles, lawful bases, consent, cookies/notices), 28–34 (DPIA, security, training, emerging software, breach and DPAs), 36–40 (rights/grievance), 43–45 (emerging technologies and transfers), and Schedules 2–10.

Technical references: OWASP ASVS, OWASP API Security Top 10, OWASP Web Security Testing Guide and NIST CSF where useful. These do not replace Nigerian law.

## 2. Engineering work already merged

- Malformed encoded authentication and CSRF cookies fail closed.
- CSRF regression tests cover safe methods, explicit unauthenticated exemptions, missing/mismatched/valid tokens and malformed encoding.
- Role-guard tests cover reviewer separation from Admin, Moderator and Support.
- Controller-level Phase 2 authorization/API security matrix prepared.
- Cookie notice/privacy wording and NDPA/GAID groundwork merged.
- Privacy documents are populated as working records under docs/privacy.

Automated CI and production verification passed for the referenced security change. This does not establish live endpoint security, full penetration testing, vendor compliance or legal compliance.

## 3. Documentation package and status

| Document | Status |
|---|---|
| docs/privacy/ROPA-REGISTER-TEMPLATE.md | Populated working ROPA; controller identity, production facts, lawful bases and approval pending |
| docs/privacy/EDUCATIONAL-AI-DPIA-TEMPLATE.md | Substantive preliminary DPIA; provider evidence, runtime tests and DPO/management decision pending |
| docs/privacy/VENDOR-PROCESSOR-AND-TRANSFER-REGISTER.md | Known vendor inventory populated; legal entities, DPAs, regions and transfer grounds pending |
| docs/privacy/DATA-SUBJECT-RIGHTS-AND-BREACH-PLAYBOOK.md | Operational draft; named contacts, implementation and exercises pending |
| docs/privacy/DATA-RETENTION-AND-DELETION-SCHEDULE.md | Proposed baseline; controller/legal approval and implementation pending |

## 4. Governance and regulatory applicability

Management and qualified Nigerian privacy counsel/DPO/DPCO must determine:
1. Exact legal controller, registered address and published privacy contact. Do not infer this from Vinosta brand/domain/sender.
2. Whether Sophis Central is a data controller/processor of major importance under NDPA s.44 and GAID Articles 8–10/Schedule 7; determine category, registration and CAR deadlines.
3. Whether DPO designation is mandatory; confirm competence/certification, publish contact, ensure management reporting, independence and resources under NDPA s.32 and GAID Articles 11–14.
4. Whether DPCO engagement, CAR filing or additional regulatory step applies.
5. Whether minors/persons lacking capacity may use the platform.
6. Lawful basis per purpose; complete Schedule 8 LIA before relying on legitimate interests and obtain valid consent where required.
7. Whether AI DPIA requires NDPC consultation if high residual risk remains.
8. Whether every cross-border transfer has a lawful route under NDPA ss.41–43 and GAID Article 45/Schedule 5.

## 5. Technical verification

Testing must be authorised, non-destructive and use synthetic accounts/data in an agreed test environment. Do not access real users' private records or perform destructive production tests.

| Area | Required tests | Tools/examples |
|---|---|---|
| Authentication/session | Signup/login/verification/reset/logout/expiry/revocation, cookie flags, CSRF, malformed cookies | Burp Suite, OWASP ZAP, browser tools |
| Authorization | Horizontal/vertical access, IDOR/BOLA, role changes, reviewer vs Admin/Moderator/Support, pending staff | Burp Repeater/Autorize, role matrix |
| API minimisation | Excessive fields, mass assignment, property authorization, rate limits, error leaks | Burp, Postman, ZAP |
| Resource/storage | Ownership, private object access, signed URL expiry, bucket policy, upload validation, deletion | Burp, S3-compatible tools |
| Messaging | DM/group membership, message ownership, voice attachments, deletion/edit access, presence leakage | Synthetic student/lecturer accounts |
| AI | Provider routing, prompt minimisation, cross-account isolation, injection, logs, fallback, retention/deletion | Redacted payload inspection, provider dashboards, Burp |
| Support/moderation/admin | Approval, escalation, route/API enforcement, audit trail, least privilege | Role matrix, Burp |
| Business logic | Referral replay, points/payment ledger, AI quota and workflow abuse | Postman/Burp/manual |
| Browser/infrastructure | XSS, injection, SSRF, path traversal, CORS, CSP, HSTS, TLS, exposed services/secrets | Burp, ZAP, Nmap (approved hosts), testssl.sh, Trivy |
| Privacy operations | Rights request, deletion, processor propagation, breach tabletop, staff access review | Synthetic records and documented exercises |

Every finding must include ID, severity, asset/endpoint, preconditions, reproducible steps, redacted evidence, impact, fix, retest and residual risk.

## 6. Outstanding evidence register

| ID | Action | Owner | Status |
|---|---|---|---|
| GOV-01 | Confirm controller identity, address and privacy contact | Management/legal | OPEN |
| GOV-02 | Determine DCPMI category, registration/CAR and DPO/DPCO obligations | DPO/DPCO/legal | OPEN |
| PRIV-01 | Approve ROPA and lawful basis per purpose | Controller + DPO | WORKING DRAFT |
| PRIV-02 | Complete Schedule 8 LIA for legitimate-interest purposes | DPO/legal | OPEN |
| PRIV-03 | Approve AI DPIA and verify actual provider routes | Product + DPO + engineering | WORKING DRAFT |
| PRIV-04 | Collect vendor DPAs, subprocessors, regions and transfer grounds | Procurement/privacy | OPEN |
| PRIV-05 | Approve retention periods and implement deletion/expiry | Management + engineering + legal | PROPOSED |
| PRIV-06 | Publish privacy/AI/cookie notices matching actual processing | Product + DPO/legal | OPEN |
| PRIV-07 | Confirm age eligibility and sensitive-data safeguards | Product + DPO | OPEN |
| PRIV-08 | Exercise rights and breach procedures; retain evidence | Privacy owner + engineering | OPEN |
| SEC-01 | Cookie notice persistence runtime retest | Frontend/security analyst | PENDING RETEST |
| SEC-02 | CSP unsafe-inline source/remediation | Engineering/security analyst | OPEN |
| SEC-03 | CORS negative tests, including credentialed origins | Security analyst | OPEN |
| SEC-04 | Authenticated API payload minimisation | Security analyst | OPEN |
| SEC-05 | Endpoint-by-endpoint RBAC, IDOR, CSRF and staff-account tests | Security analyst | OPEN |
| SEC-06 | Resource, messaging, voice and AI cross-account isolation | Security analyst | OPEN |
| SEC-07 | Infrastructure, dependency, secret and upload testing | Security analyst | OPEN |

## 7. Exit criteria

Do not declare full compliance until controller identity and regulatory applicability are determined; ROPA, DPIA, LIAs and retention are approved; vendors, DPAs, locations and transfer routes are evidenced; notices match actual processing; rights and breach workflows are implemented/tested; DPO/DPCO/registration/CAR obligations are met; and critical/high technical findings are fixed or formally risk-accepted and retested.

Review quarterly during launch and after material changes. Review ROPA/vendor/retention at least annually and DPIA before new high-risk processing. Retain evidence and version history.
