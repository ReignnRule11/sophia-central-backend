# Sophis Central — Vendor, Processor and International Transfer Register

**Status:** Populated inventory from known repository configuration/project context. Not a vendor approval, signed DPA register or certification of lawful transfers.  
**Owner:** Management/procurement/privacy lead. **Version:** 1.0 — 22 November 2026.

## 1. Vendor inventory

A provider being named does not prove production activation, its precise legal role, or that a transfer is lawful. Confirm the contracting legal entity, account owner, plan, region, subprocessors and binding terms.

| Service | Provider / known configuration | Data potentially processed | Known state | Evidence required |
|---|---|---|---|---|
| Frontend hosting/CDN | Vercel; frontend sophiscentral.vercel.app | IP/device/request metadata, frontend content, session traffic | Production hosting known | Contracting entity, project/CDN/log regions, support access, DPA, subprocessors, log retention and transfer assessment |
| Backend hosting | Render; backend service in Ohio per project context | API payloads, account/profile/message/resource metadata, security logs | Production service known | Legal entity, DPA, backups/log regions, support access, retention, subprocessors, incident SLA and transfer mechanism |
| Database | Neon Postgres | Account, academic, resource, messaging, support, moderation and transaction data as applicable | Production database configured | Project region, backups/PITR, support access, DPA, subprocessors, retention/deletion and transfer ground |
| Cache/realtime | Render Redis Key Value | Presence, realtime events and transient/cache metadata; confirm whether message content is cached | Redis service known | Region, persistence/eviction, backups, TTL, DPA, access and retention |
| Object storage | Cloudflare R2 S3-compatible bucket sophia-central | Academic documents, profile images, attachments and voice recordings | R2 use known from project context | Bucket jurisdiction, account legal entity, DPA, ACL/public access, lifecycle/deletion, logs and transfer basis |
| Transactional email | Resend; sender domain send.vinosta.com; info@send.vinosta.com | Email addresses, verification/reset/support content and delivery metadata | Resend configured | Contracting entity, region, logs/retention, support access, DPA, subprocessors and account ownership |
| Error monitoring | Sentry project sophis-central-backend | Error traces, identifiers, request metadata and potentially accidental personal data | Production DSN configured per project context | Region/plan, PII scrubbing, retention, access, DPA and subprocessors |
| AI primary | Groq; GROQ_API_KEY; default model openai/gpt-oss-120b in .env.example | Prompts, selected files/context, outputs and request metadata | Primary provider in repository example; production activation to verify | Actual account/model, region, DPA/terms, subprocessors, training, retention, human review, deletion, incident SLA and transfer basis |
| AI fallback | Google Gemini; GEMINI_API_KEY; default gemini-3.8-flash in .env.example | Same categories when fallback invoked | Fallback in repository example; production activation to verify | Account/model, region, DPA/terms, training/retention, subprocessors, deletion and transfer basis |
| Other AI adapters | OpenAI, Anthropic, Azure OpenAI and Llama adapters exist in source | Prompts/context/outputs if activated | Source presence only; production use unconfirmed | Confirm disabled/enabled, route selection, credentials, account and data terms; remove unused production credentials |
| Payments | Paystack/Flutterwave options in .env.example | Transaction references, payment status and payer/payee details if enabled | Configurable options; active provider unconfirmed | Active provider, merchant entity, DPA, data fields, regions, retention, subprocessors and transfer basis |
| Analytics/advertising | No provider certified here | Possible cookie/device/usage data if scripts are active | Not established | Inspect deployed scripts, cookies and network calls; record only providers actually active |

## 2. Controller/processor classification

For each service determine whether it acts as a processor on documented instructions, an independent controller for billing/fraud/security/legal purposes, a subprocessor, or a party with mixed roles. Do not infer legal role from brand or marketing material alone.

## 3. Required evidence for every vendor

1. Legal entity, registered address, service scope and Sophis Central account owner.
2. Executed DPA/equivalent binding data-protection terms and version.
3. Current subprocessor list and change-notification process.
4. Exact primary, backup, log, disaster-recovery and remote-support locations.
5. Security controls: encryption, access control, audit logs, vulnerability management, assurance and incident response.
6. Retention, export, deletion, backup expiry and post-termination deletion commitments.
7. Breach-notification deadline materially shorter than controller's statutory 72-hour clock.
8. Government-request and confidentiality provisions.
9. Transfer mechanism under NDPA ss.41–43 and GAID Art.45/Schedule 5, transfer risk assessment and supplementary safeguards where required.
10. AI-specific restrictions on training, prompt retention, human review, abuse monitoring and onward disclosure.

## 4. International transfer register

| ID | From / recipient | Data | Transfer assessment | Status |
|---|---|---|---|---|
| T01 | Nigeria/Sophis Central → Render backend (Ohio region noted) | API/account/service data | Confirm legal entity, DPA, destination, lawful ground, risk assessment and safeguards | OPEN — no compliance conclusion |
| T02 | Sophis Central → Neon | Database records/backups | Confirm project region, backups, support access and statutory transfer route | OPEN |
| T03 | Sophis Central → Vercel/CDN | Request metadata/frontend traffic | Confirm CDN/log locations and transfer route | OPEN |
| T04 | Sophis Central → Cloudflare R2 | Files, images, voice and attachments | Confirm bucket jurisdiction, replication, support access and transfer route | OPEN |
| T05 | Sophis Central → Resend | Email and delivery metadata | Confirm processing region, support access and transfer terms | OPEN |
| T06 | Sophis Central → Groq/Gemini/other active AI provider | Prompts, selected context/files, outputs | Provider-specific region, contract, transfer basis and safeguards | OPEN |
| T07 | Sophis Central → Sentry | Error events/diagnostics | Confirm region, scrubbing and remote access | OPEN |
| T08 | Sophis Central → payment provider, if active | Transaction/payment metadata | Confirm active provider, destination and lawful route | OPEN |

A global privacy statement or generic DPA alone is not proof of a lawful transfer. Record the applicable statutory route, destination, risk assessment, supplementary safeguards and approval.

## 5. Procurement/change controls

No new vendor, model, analytics tool or storage location may receive personal data before privacy/security review. Engineering must notify the privacy owner before enabling a dormant provider adapter or fallback. On termination, export required records, revoke credentials, delete provider-held data where required and obtain confirmation. Review annually and on material changes.

## 6. Sign-off

Vendor/procurement owner: __________________  
Engineering owner: __________________  
DPO/DPCO: __________________  
Controller management: __________________
