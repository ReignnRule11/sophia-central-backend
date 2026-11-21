# Sophis Central — Educational Records and AI DPIA

**Status:** Assessment template; not an approved DPIA.  
**Assessment owner:** [NAME / ROLE]  
**DPO/DPCO reviewer:** [NAME / QUALIFICATION]  
**Decision authority:** [MANAGEMENT]  
**Assessment date / version:** [DATE / VERSION]

> Complete this assessment using the applicable NDPA 2023 and GAID 2025 requirements and schedules. Do not infer provider retention, model-training settings, processing locations or legal basis. Obtain the current AI provider contracts and configuration evidence before approval.

## 1. Processing description

- Processing activity: AI assistance for learning/research, including prompts, uploaded context/files, generated responses and usage/quota records.
- Data subjects: [STUDENTS / LECTURERS / REVIEWERS / OTHERS — CONFIRM].
- Data categories: [PROMPTS, ACADEMIC RECORDS, FILE CONTENT, IDENTIFIERS, SPECIAL-CATEGORY DATA IF ANY].
- Scale and frequency: [ACTIVE USERS, REQUEST VOLUME, FILE VOLUME, FREQUENCY].
- Data sources: [USER INPUT / CONNECTED SOURCES / OTHER].
- AI provider(s), model(s), account owner and subprocessors: [LIST].
- Processing locations and remote support access: [VERIFY].
- Provider retention, abuse-monitoring, training and deletion settings: [CONTRACT + SCREENSHOT/EXPORT EVIDENCE].
- Human review and automated decision-making: [DESCRIBE; CONFIRM WHETHER OUTPUTS AFFECT ACCESS, GRADING, ELIGIBILITY OR OTHER SIGNIFICANT DECISIONS].

## 2. Necessity and proportionality

For each purpose, record:
- Why the processing is necessary and why a less intrusive option is insufficient.
- Whether prompts/files can be minimised, redacted or processed without direct identifiers.
- Whether users can avoid AI processing without losing unrelated core platform services.
- Whether minors or vulnerable data subjects are in scope and what safeguards apply.
- Whether AI outputs are advisory or used to make decisions about individuals.
- Accuracy, bias, hallucination and human-review controls.
- How transparency, access, correction, objection, erasure and complaint rights are supported.

## 3. Risk register

| Risk | Affected people | Likelihood | Severity | Existing controls (evidence) | Additional mitigation | Owner | Residual risk / acceptance |
|---|---|---|---|---|---|---|---|
| Student uploads/prompts disclose personal or confidential academic data to provider | Students / lecturers | [ASSESS] | [ASSESS] | [VERIFY] | Data minimisation, warning, redaction, approved-use restrictions | [OWNER] | [ASSESS] |
| Provider retains prompts or uses content for model improvement | Users | [ASSESS] | [ASSESS] | [CONTRACT/SETTING] | Contractual opt-out/retention limits; no sensitive content if unsupported | [OWNER] | [ASSESS] |
| Cross-border processing lacks an evidenced transfer mechanism/safeguards | Users | [ASSESS] | [ASSESS] | [VERIFY] | Legal transfer assessment and documented safeguards | [OWNER] | [ASSESS] |
| Cross-account prompt/session/file exposure | Users | [ASSESS] | [ASSESS] | [TEST] | Object-level authorization, isolation tests, logging and incident response | Engineering | [ASSESS] |
| AI output is inaccurate, biased or misused as an authoritative decision | Students / lecturers | [ASSESS] | [ASSESS] | [VERIFY] | Clear limitations, human oversight, appeal/correction process | [OWNER] | [ASSESS] |
| Prompt injection or malicious uploaded content causes disclosure or unsafe actions | Users / platform | [ASSESS] | [ASSESS] | [TEST] | Treat retrieved content as untrusted; tool/data isolation; safe output handling | Engineering | [ASSESS] |
| Excessive prompt/log retention | Users | [ASSESS] | [ASSESS] | [VERIFY] | Purpose-based retention, deletion propagation and backup expiry | [OWNER] | [ASSESS] |

## 4. Consultation and safeguards

- Data subjects / student representatives consulted: [DETAILS OR REASON NOT CONSULTED].
- DPO/DPCO advice: [DATE / ADVICE].
- AI provider contractual review: [RESULT].
- Security assessment and authorization test references: [FINDING IDS].
- Human review, escalation and contestability: [PROCESS].
- Training and staff access controls: [EVIDENCE].
- Incident and breach notification process: [LINK].

## 5. Decision

- [ ] Proceed.
- [ ] Proceed only after listed mitigations.
- [ ] Pause pending evidence or consultation.
- [ ] Do not proceed because residual risk is unacceptable.

Conditions, owner and due date: [COMPLETE].

**DPO/DPCO recommendation:** [SIGN / DATE]  
**Management approval:** [SIGN / DATE]

Reassess before material changes to AI provider/model, data categories, purposes, processing locations, retention, user groups or automated decision-making.
