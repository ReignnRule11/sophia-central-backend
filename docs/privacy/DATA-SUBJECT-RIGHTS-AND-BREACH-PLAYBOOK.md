# Sophis Central — Data Subject Rights and Personal Data Breach Playbook

**Status:** Operational procedure draft. Named contacts, management approval, training and exercises remain required.  
**Controller:** Legal entity to be confirmed. **Privacy contact/DPO:** Must be approved and published.  
**Incident channel:** Restricted internal channel/on-call contact to be designated.  
**Version:** 1.0 — 22 November 2026.

## A. Data-subject rights procedure

### A1. Rights covered
Handle rights under NDPA Part VI, including access, rectification, objection, withdrawal of consent where consent is the basis, erasure/right to be forgotten subject to lawful exceptions, and portability where statutory conditions apply. Consider restriction and related safeguards where applicable. Never promise absolute deletion where a lawful retention exception or another person's rights apply.

### A2. Intake
Publish one monitored privacy contact and, when implemented, an authenticated in-product privacy request route. Until then, use the published contact. Record request ID, received timestamp, verified requester/account, right invoked, relevant systems/records, scope, representative authority, statutory deadline, owner, decision and response evidence.

### A3. Identity and authority
Verify through an authenticated account or proportionate independent check. Do not request NIN/passport by default. Verify representative authority and scope. Do not reveal whether another person's account exists. Store verification evidence separately with restricted access.

### A4. Triage and fulfilment
1. Acknowledge and log; assign privacy owner.
2. Verify identity and clarify scope if reasonably necessary.
3. Use ROPA to locate Neon/database, R2/object storage, Redis/cache, Resend, AI providers, Sentry/logs and payment processor where applicable.
4. Assess statutory scope, exceptions, third-party rights, legal holds and security risks.
5. For access, provide the requester's data securely and exclude other users' private data.
6. For rectification, correct source records and propagate to recipients/processors where required.
7. For erasure, remove/anonymise eligible active data and objects; propagate to processors; document backup expiry and lawful exceptions.
8. For objection/restriction/withdrawal, stop or limit the relevant processing where legally required. Withdrawal must be as easy as giving consent; do not disable unrelated contract processing.
9. For portability, provide eligible data in a commonly used machine-readable format where statutory conditions apply.
10. Record systems searched, processor contacts, actions, exceptions and completion evidence.
11. Respond within the applicable NDPA/GAID timeframe. Escalate uncertainty/refusal to DPO/legal immediately; do not invent extensions.
12. Explain applicable complaint routes, including NDPC.

### A5. Role separation
Support may receive/classify but cannot approve complex disclosure or export production databases. Moderator handles moderation only. Privacy owner/DPO coordinates; engineering performs approved technical actions; Admin/management authorises resources and risk decisions. Log all privileged access and exports.

### A6. Request register
Request ID | received time | identity verification | right invoked | systems searched | processors contacted | decision/legal reason | actions/evidence | response date/deadline | reviewer.

## B. Personal data breach response

### B1. Report immediately
Any employee/contractor/operator suspecting loss, alteration, unauthorised disclosure/access, ransomware, compromised credentials, exposed storage, misdirected email, AI-provider incident or cross-account access must report immediately. Do not wait to prove impact.

### B2. Incident command
Management appoints incident commander, engineering lead, privacy/DPO lead and communications owner. Preserve timestamps/evidence and restrict incident-record access.

### B3. First response
1. Record first awareness time and who became aware.
2. Preserve logs, request IDs, messages, object metadata, provider notices and evidence hashes.
3. Contain safely: revoke exposed keys/tokens, invalidate sessions, disable integrations, restrict exposed objects/routes and isolate affected services.
4. Do not destroy evidence during cleanup.
5. Identify systems, data subjects/categories, sensitivity, approximate records, recipients, duration, geography and whether data was accessed, altered, lost or disclosed.
6. Contact processors immediately for facts, containment and evidence.
7. Assess likelihood/severity, including identity fraud, account takeover, academic/reputational harm, discrimination, financial loss and safety risks.

### B4. Statutory notification
NDPA s.40(2) requires notification to NDPC within 72 hours of awareness of a breach likely to result in risk to individuals' rights and freedoms. Where likely high risk, communicate to affected data subjects immediately in clear language with practical mitigation advice, subject to statutory provisions. Include controller contact, likely consequences and measures taken/proposed. If facts are incomplete, make the legally required initial notification with available information and supplement as permitted; do not wait for a complete investigation. Record any delay and obtain DPO/legal advice.

A processor must notify the engaging controller/processor on becoming aware and provide information needed for compliance (NDPA s.40(1)). Vendor contracts should require prompt notice materially shorter than the controller's 72-hour period.

### B5. Breach decision record
Incident ID | awareness timestamp | discovery source | systems | data categories | approximate people/records | risk assessment | containment | processor notices | NDPC decision/time/reference | data-subject notice/time | no-notice reason | remediation/retest.

### B6. Recovery
Complete root-cause analysis, rotate credentials, restore from verified backups, retest controls, notify as legally required, update ROPA/DPIA/vendor register, preserve evidence and conduct lessons-learned review/tabletop.

## C. Roles

| Role | Responsibility |
|---|---|
| First reporter | Report immediately; preserve evidence, do not investigate independently |
| Incident commander | Coordinate timeline, decisions and escalation |
| Engineering lead | Containment, evidence, recovery, technical analysis and retest |
| Privacy lead/DPO | Rights requests, risk assessment, notification analysis and regulator liaison |
| Vendor owner | Obtain provider facts and enforce contractual cooperation |
| Support | Intake and route; no unauthorised exports |
| Moderator | Moderation only; escalate privacy/security matters |
| Admin/management | Resource response and ensure statutory duties |
| DPCO/legal | Advise on NDPA/GAID, DCPMI, notification and regulatory obligations |

## D. Readiness tests

- [ ] Synthetic access request and secure export.
- [ ] Profile correction and propagation.
- [ ] Erasure across database, objects, AI provider, email and backup expiry.
- [ ] Withdrawal/objection for a genuinely consent-based optional purpose.
- [ ] Cross-account exposure tabletop.
- [ ] Compromised privileged account tabletop.
- [ ] Object-storage exposure and AI-provider incident tabletop.
- [ ] Confirm on-call escalation and NDPC submission channel.
- [ ] Approve procedure and train staff.

## E. Message templates

**Acknowledgement:** "We received your privacy request (reference [ID]) on [date]. We are verifying it and will respond within the applicable legal timeframe. We may contact you if clarification is reasonably necessary."

**Internal incident report:** "Incident [ID]; first awareness [timestamp/timezone]; reporter [role]; affected service [service]; suspected data [categories]; affected people/records [known/unknown]; containment [actions]; processors contacted [names]; next update [time]."

**Data-subject breach notice:** Explain what happened/when, data involved, likely consequences, measures taken, practical protective steps and approved privacy/DPO contact. Obtain DPO/legal approval before sending.

This procedure becomes operational only after named contacts, secure registers, escalation coverage and tabletop tests are in place.
