# Sophis Central — Data Subject Rights and Personal Data Breach Playbook

**Status:** Operational procedure draft; management and qualified privacy review required.  
**Privacy contact:** [PUBLISH APPROVED CONTACT]  
**DPO/DPCO escalation:** [NAME / CONTACT]  
**Incident channel:** [RESTRICTED CHANNEL / PHONE]  
**Approved by:** [MANAGEMENT] / [DATE]

## A. Data subject request workflow

### Intake
Accept requests through the published privacy contact and any supported in-product route. Record:
- Request ID and received timestamp.
- Requester identity and verified account/contact channel.
- Request type: access, correction, erasure, restriction, objection, portability where applicable, or consent withdrawal where consent is the basis.
- Relevant accounts, records, dates and requested outcome.
- Any representative authority and scope.

Do not collect additional identity documents unless necessary and proportionate. Store verification evidence separately with restricted access.

### Triage and response
1. Acknowledge receipt and assign a privacy owner.
2. Verify identity securely; do not disclose whether another person's account exists.
3. Identify systems and processors that may hold the data using the approved ROPA.
4. Determine whether the request applies, whether an exception or lawful retention obligation applies, and whether clarification is needed.
5. Obtain DPO/legal review for refusal, restriction, complex requests or third-party rights.
6. Apply the decision consistently to primary systems, object storage, AI providers, email/support systems, logs and backups where applicable.
7. Notify relevant processors and obtain completion evidence where required.
8. Respond within the applicable statutory period, including any legally permitted extension or reasoned refusal.
9. Record actions, systems searched, decision, response date, exceptions and appeal/complaint information.

### Technical safeguards
- Use a dedicated, least-privilege operator workflow; do not ask support staff to query production databases manually.
- Verify account ownership and object ownership before export or correction.
- Export only the requester's personal data and protect the delivery channel.
- Distinguish deletion from anonymisation, suppression and legal hold.
- Propagate deletion to object storage and processors; record backup expiry rather than claiming immediate backup erasure.
- Preserve only records that have an evidenced lawful retention reason.
- Do not delete shared academic content or another person's messages without evaluating other data subjects' rights and the lawful basis for retention.

## B. Personal data breach response

### Immediate response
1. Report suspected incidents immediately to [INCIDENT CHANNEL].
2. Assign an incident commander and DPO/privacy lead.
3. Preserve logs, evidence and timestamps; restrict access to the incident record.
4. Contain the incident without destroying evidence: revoke exposed credentials/tokens, disable compromised integrations, isolate affected objects or routes, and stop further disclosure.
5. Identify affected systems, data categories, subjects, volume, recipients, time window and whether data was accessed, altered, lost or disclosed.
6. Engage affected processors and obtain their incident facts and cooperation.
7. Assess likely harm/risk to individuals with the DPO/legal lead and document the reasoning.

### Notification decision
- Apply the NDPA/GAID breach notification rules and statutory threshold with qualified privacy counsel/DPO.
- Where the statutory notification threshold is met, support notification to the NDPC within the applicable 72-hour period from awareness; document the awareness time and any legally acceptable reason for delay.
- Notify affected data subjects where required, using clear language and practical protective steps.
- Do not notify every security event as a personal data breach; do not suppress a reportable breach because the investigation is incomplete. Make an initial notification when legally required and supplement it as facts develop.

### Post-incident
- Complete root-cause analysis and remediation.
- Retest affected controls and monitor for recurrence.
- Maintain a restricted breach register: incident ID, awareness time, facts, affected data, risk assessment, decisions, notifications, mitigation and lessons learned.
- Review processor obligations, access rights, retention, user notices and DPIA/ROPA updates.
- Conduct a tabletop exercise at an approved cadence.

## C. Roles and escalation

| Role | Responsibility |
|---|---|
| First responder / staff member | Report immediately; do not investigate beyond safe preservation |
| Engineering incident lead | Containment, technical evidence, recovery and retest |
| Privacy lead / DPO | Risk assessment, rights decisions, notification advice and regulator liaison |
| Processor/vendor owner | Obtain vendor facts, contractual escalation and deletion/containment confirmation |
| Management | Resource response, approve risk acceptance and ensure statutory duties are met |
| Legal counsel / DPCO | Advise on NDPA/GAID interpretation, exemptions, notification and registration |

## D. Required readiness tests

- [ ] Test a verified access request using a synthetic account.
- [ ] Test correction of a profile field and propagation to relevant systems.
- [ ] Test deletion request, grace period, processor propagation, object cleanup and backup expiry evidence.
- [ ] Test objection/restriction and consent withdrawal where relevant.
- [ ] Tabletop a compromised account and cross-account data exposure.
- [ ] Tabletop an object-storage exposure and AI-provider incident.
- [ ] Confirm escalation contacts and after-hours coverage.
- [ ] Confirm the applicable NDPC reporting channel and approved notification templates.
- [ ] Approve this procedure with the DPO/DPCO and management.

This playbook does not replace case-specific legal advice or a qualified assessment of the statutory reporting threshold.
