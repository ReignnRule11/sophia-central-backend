# Sophis Central — Educational Records and AI Data Privacy Impact Assessment

**Status:** Substantive preliminary DPIA populated from known product scope and repository configuration. Not a signed final DPIA; production evidence, provider contracts, scale information and DPO/legal review remain outstanding.  
**Controller:** Legal entity to be confirmed. **Owner:** Product/management to assign. **DPO/DPCO:** To appoint/confirm.  
**Version:** 1.0 — 22 November 2026.  
**Framework:** NDPA 2023 s.28; GAID 2025 Articles 28, 43–44 and Schedule 4.

## 1. Executive decision

**Preliminary decision: CONDITIONAL HOLD on expansion or new AI processing involving personal, sensitive or confidential educational data until the evidence and mitigations below are complete.** Existing AI use should be limited to minimum necessary input and provider settings that management can evidence. This is precautionary, not a finding that current processing is unlawful.

A DPIA is required where processing is likely to result in high risk. The combination of educational-user data, uploaded content and emerging AI makes a documented assessment appropriate before material expansion. If high residual risk remains, obtain NDPC consultation where required before proceeding.

## 2. Processing description

**Purpose:** User-requested AI learning/research assistance. Outputs should be informational, not authoritative grading, admissions, disciplinary, eligibility or employment decisions. Product owner must confirm this boundary.

**Data subjects:** Students and lecturers; reviewers/staff if their information enters prompts or uploaded content. Confirm whether users under 18 or persons lacking legal capacity may register.

**Data:** Prompts, selected uploaded/context files, generated responses, identifiers included in requests/logs, usage/quota records, provider request IDs and technical metadata. Files may contain third-party personal data, academic records, contact details, sensitive information or confidential/copyrighted material.

**Sources:** Direct user input, files deliberately selected by users and platform context explicitly included in the request. Do not include unrelated profiles, messages or library contents by default.

**Providers:** Environment example identifies Groq as primary and Gemini as fallback. OpenAI, Anthropic, Azure OpenAI and Llama adapters also exist in source; source presence does not prove production activation. Engineering must provide the actual production routing, enabled models, account owners, provider terms, subprocessors and regions.

**Locations/transfers:** Not established. Treat external provider processing or support access outside Nigeria as a potential international transfer pending provider-specific assessment under NDPA ss.41–43 and GAID Art.45/Schedule 5.

**Retention/training:** Not established by source code. Obtain provider account settings and terms for prompts, outputs, abuse monitoring, human review, model training, deletion, backups and support access. Do not claim zero retention/no training without documentary evidence.

**Automated decisions:** No evidence reviewed that AI outputs determine grades, admissions, sanctions, eligibility or other significant outcomes. Product owner must confirm. Any such use requires a separate assessment and legal approval.

## 3. Necessity and proportionality

1. Send data only when the user deliberately invokes AI.
2. Send only the prompt and selected context needed; do not automatically include full profiles, messages, libraries or unrelated files.
3. Display an AI-specific notice before first use describing provider processing, possible international transfers, retention/training terms and warnings against sensitive/third-party confidential data.
4. Keep AI optional and separate from core account, messaging and resource features where practicable.
5. Do not use prompts/outputs to train Sophis Central models without a separately approved purpose, lawful basis, notice and rights process.
6. Do not use AI for profiling or solely automated decisions with legal or similarly significant effects.
7. Explain that outputs may be inaccurate; provide reporting and human escalation.
8. Apply input/output limits, file validation and malware scanning; treat files and retrieved text as untrusted.
9. Minimise/redact identifiers not needed; prevent secrets, tokens and internal system prompts from being sent.
10. Confirm age eligibility and safeguards for vulnerable users.

## 4. Provisional lawful-basis analysis

- **Contract:** Potentially appropriate only where AI is expressly requested and objectively necessary to deliver that feature. It does not cover unrelated training, profiling or analytics.
- **Consent:** Consider for optional AI not necessary to the core service or where consent is the applicable condition for sensitive-data processing. It must be specific, informed, freely given, demonstrable and withdrawable without loss of unrelated services.
- **Legitimate interests:** May support limited security/abuse prevention only after a documented GAID Schedule 8 LIA and balancing test. It must not be assumed to authorise sending all prompt content to an AI provider.
- **Legal obligation/vital/public interest:** Not assumed; identify the specific legal requirement before relying on these bases.

DPO/legal must record the chosen basis and any additional condition for sensitive data before approval.

## 5. Risk assessment

Likelihood/impact ratings are preliminary qualitative judgements, not measured probabilities. Residual risk remains unrated until evidence and retesting are complete.

| Risk | Inherent likelihood / impact | Existing evidence | Required mitigation/evidence | Owner/status |
|---|---|---|---|---|
| Personal/confidential data in prompts/files disclosed to provider | High / High | Providers configured in source; no verified provider contract or outbound minimisation evidence | Notice, minimisation/redaction, approved DPA, sensitive-data restrictions, inspect outbound payloads | Product/Engineering/DPO — OPEN |
| Provider retention, human review or training inconsistent with expectations | Medium / High | Not established by code | Obtain terms/settings for each active model; disable training where available; document exceptions | Vendor owner — OPEN |
| Cross-border transfer without lawful ground/safeguards | Medium / High | Regions not verified | Map locations and remote access; assess adequacy/approved instrument or applicable statutory ground; record safeguards | DPO/legal — OPEN |
| Prompt injection or malicious file causes disclosure/unsafe behaviour | Medium / High | Uploaded context feature exists | Treat content as untrusted; isolate tools; test malicious documents and data boundaries | Engineering — OPEN |
| Cross-account prompts/files/output exposed | Medium / High | General authorization tests exist; AI runtime matrix not evidenced | Test synthetic Student A/B, Lecturer A/B, reviewer/staff accounts, caches and logs | Security analyst — OPEN |
| Inaccurate/biased output harms students | Medium / High | AI described as assistance; review process unverified | Clear limitations, no consequential automated decisions, report/appeal and human escalation | Product — OPEN |
| Excessive prompt/output/log retention | Medium / High | Retention settings unverified | Purpose-based retention, provider deletion, backup expiry and audit trail | Engineering/DPO — OPEN |
| Sensitive data/minors processed unexpectedly | Medium / High | Age and content safeguards unresolved | Confirm age policy; warnings/restrictions; assess NDPA ss.30–31 and GAID vulnerability safeguards | Product/DPO — OPEN |
| Vendor compromise or onward disclosure | Medium / High | Vendor register populated; DPAs/subprocessors unverified | Due diligence, DPA, incident notice, subprocessor review, exit/deletion clauses | Procurement — OPEN |

## 6. Required safeguards before approval

- Publish AI-specific notice and user guidance at point of use.
- Confirm actual providers/models and execute/verify processor terms.
- Verify provider retention, training, abuse-monitoring, human review and deletion controls.
- Complete a transfer assessment for each processing/support location.
- Verify prompts contain no unrelated profile/message data.
- Test cross-account and role isolation with synthetic accounts.
- Establish deletion and rights-request propagation to each provider.
- Confirm no consequential automated decisions.
- Train staff and establish AI-provider incident escalation.

Engineering must capture redacted outbound requests for each active provider, verify logs do not unnecessarily store prompts/files, protect API keys, test quota bypass and ensure fallback does not silently route data to an unapproved provider.

## 7. Consultation and accountability

Student/data-subject consultation: not evidenced; record whether undertaken or why not proportionate. DPO/DPCO advice, provider contract review, AI-specific runtime security results and management risk acceptance are pending. Determine whether NDPC prior consultation is required if high residual risk remains.

## 8. Decision and sign-off

**Current decision: CONDITIONAL HOLD pending evidence and mitigations above.**

| Approval | Name | Decision/date |
|---|---|---|
| Product owner | To assign | Pending |
| Engineering lead | To assign | Pending |
| DPO/DPCO | To appoint/confirm | Pending |
| Controller management | To assign | Pending |

Reassess before provider/model, data category, user group, location, retention, training, profiling or automated-decision changes. Review against the official GAID Schedule 4 template before approval.
