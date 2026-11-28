# Sophis Central — Technical and Operating-Cost Due Diligence

**Research date:** 28 November 2026  
**Currency convention:** NGN for operating budgets; USD for vendor-price references and investor comparison.  
**Purpose:** Evidence-based technical inventory, public vendor-price benchmarks, operating risks and the remaining evidence needed to produce an approved 12-month budget.

> **Important limitation:** This review examines the public backend repository and public vendor pricing. It does not have access to private Render, Vercel, Neon, Resend, Groq, Gemini, Paystack or Flutterwave billing dashboards, invoices, production utilization metrics, contracts, or payroll records. Public list prices below are reference prices, not Sophis Central's actual bills. No total monthly operating cost or funding ask can responsibly be certified until those private records are reconciled.

## 1. Executive assessment

Sophis Central's backend is a multi-service academic platform, not a minimal CRUD API. The repository documents a NestJS 11 / TypeScript application with PostgreSQL/TypeORM, Redis, S3-compatible file storage, OCR/document extraction, AI-provider fallback, email delivery, payments, payouts, reconciliation, moderation, messaging, analytics and support.

The most material cost drivers are likely to be:
1. API compute and memory, especially OCR/document processing.
2. PostgreSQL compute, storage, connection capacity, backup/restore and data growth.
3. Object storage and download egress for academic materials and attachments.
4. AI token consumption, particularly long document context and fallback calls.
5. Payment processing, refunds, disputes, transfers and payout operations.
6. Email/OTP and support operations.
7. Engineering, QA, security, institutional onboarding and customer support capacity.

**Conclusion:** Do not finalize a fundraising amount from public price lists alone. First reconcile provider invoices and dashboards, confirm the production topology and measure real workload. There is enough public evidence to build a cost model and identify risks, but not enough to claim the current monthly spend or a validated cost at 1k/5k/10k/50k MAU.

## 2. Repository evidence reviewed

The following source files were inspected on the default branch:

- `package.json`: NestJS 11, TypeScript, TypeORM, PostgreSQL driver, Redis client, AWS S3 SDK, OpenAI SDK, Sentry Node SDK, bcrypt, Passport, rate limiting and security middleware.
- `Dockerfile`: Node 20 Alpine build/runtime images; production image installs Poppler utilities and Tesseract OCR English data.
- `docker-compose.yml`: local PostgreSQL 16, Redis 7 and MinIO services.
- `.env.example`: environment contract for PostgreSQL, Redis, S3-compatible storage, Resend, Groq, Gemini, Paystack, Flutterwave, Sentry and security settings.
- `src/app.module.ts`: application modules include auth, users, resources, search, institutions, courses, moderation, points, uploads, AI, referrals, notifications, analytics, support, chat and payments.
- `src/upload/s3.service.ts`: AWS SDK S3 client with configurable endpoint; presigned uploads/downloads, object reads, deletes and metadata operations.
- `src/ai/ai-provider.service.ts`, `src/ai/groq.service.ts`, `src/ai/gemini.service.ts`: Groq primary provider and Gemini fallback; request retries/timeouts and token/context preparation.
- `src/payments/payments.service.ts` and provider adapters: provider-neutral payment flow, transaction verification, refunds and reconciliation interfaces; Paystack and Flutterwave adapters are present.
- `src/config/typeorm.config.ts`: PostgreSQL configuration; production requires explicit DB environment variables; TypeORM synchronization is disabled in production.
- `src/common/services/sentry.service.ts`: Sentry initializes only when `SENTRY_DSN` is configured.

This is code evidence. It does not establish which environment variables are populated in production, which providers are currently selected, whether integrations have live credentials, or what is being billed.

## 3. Current architecture and cost implications

| Layer | Repository evidence | Cost drivers | Due-diligence status |
|---|---|---|---|
| API | NestJS 11, Node 20 Docker runtime | CPU, RAM, instance count, bandwidth, build/deploy minutes | Code verified; live plan/invoice unknown |
| Database | PostgreSQL + TypeORM; many entities and payment/audit records | Compute, storage, IOPS, connections, backup retention, restore/PITR | Engine verified; provider/plan/usage unknown |
| Cache/ephemeral state | Redis client; Redis-backed MFA/replay features documented | Memory, persistence, availability, connections | Dependency verified; provider/plan unknown |
| File storage | AWS S3 SDK; endpoint and credentials configurable | GB-month, PUT/GET requests, egress, lifecycle, replication | S3-compatible integration verified; actual provider/bucket/billing unknown |
| OCR | Poppler and Tesseract installed in runtime image; document extraction used by AI resource flow | CPU, RAM, processing time, image/PDF size, temporary storage | Runtime dependency verified; throughput unknown |
| AI | Groq primary, Gemini fallback; GPT-OSS 120B default; Gemini 3.8 Flash default in code | Input/output tokens, retries, fallback rate, document context, abuse | Provider integration verified; actual token usage and spend unknown |
| Email | Resend environment variables | Monthly volume, overage, deliverability and dedicated IP/domain needs | Integration config present; sender/domain verification and plan unknown |
| Payments | Paystack and Flutterwave provider adapters | Percentage fee, fixed fee, VAT on fees, transfers, refunds, disputes | Code adapters verified; active provider and merchant rate contract unknown |
| Observability | Sentry SDK optional via DSN | Event volume, retention, seats and performance monitoring | SDK present; configured status/plan unknown |
| Frontend | Separate Vercel-hosted web client per project history | Plan, bandwidth, functions, build minutes, seats and observability | Hosting platform historically identified; current plan/invoice unknown |
| CI/CD | GitHub Actions workflows | Runner minutes, artifact retention, concurrency | Workflows exist; usage/billing owner unknown |

### Important distinction: local Docker versus production

The Docker Compose file is a local development stack and includes development credentials for PostgreSQL and MinIO. Those values must never be reused in production. The Compose file does not prove that MinIO is the production object store.

The S3 service is configured through AWS-compatible environment variables and a configurable endpoint. The actual production object-store provider must be confirmed from deployment configuration and invoices. Do not budget both MinIO and AWS S3 as production services unless both are actually operated.

The README's broad technology summary mentions MinIO/S3-compatible storage and OpenAI-compatible AI integration. Current implementation evidence is more specific: S3 SDK integration, Groq primary AI and Gemini fallback. Documentation should keep this distinction clear.

## 4. Public vendor price benchmarks

Prices are USD list-price references checked on 28 November 2026. Taxes, FX conversion, negotiated discounts, regional pricing, usage and plan-specific terms may change the amount billed.

### 4.1 Render — API / managed services benchmark

Render's public pricing page currently lists:
- Small web service: $7/month (512 MB RAM).
- 1 CPU / 2 GB RAM service: $25/month.
- 2 CPU / 4 GB RAM service: $85/month.
- Render Postgres examples: $6/month (256 MB), $19/month (1 GB RAM), $40/month (2 GB RAM).
- Redis-compatible Key Value: $10/month (256 MB), $20/month (1 GB).
- Pro workspace: $25/month, plus compute.
- Bandwidth beyond included allowance: $0.15/GB on listed workspace tiers.

These are menu prices, not evidence of the live Sophis Central service size or invoice. For this backend, the $7 / 512 MB service should be treated as a low-cost test baseline, not automatically accepted as production capacity: OCR/PDF extraction and concurrent API work may make memory/CPU headroom inadequate. Run load tests and observe peak memory before selecting a tier.

Source: https://render.com/pricing

### 4.2 Vercel — web client benchmark

Vercel currently lists Hobby at $0/month and Pro at $20/month with $20 usage credit. Its pricing page states Hobby is for personal/non-commercial projects; Pro is the professional plan. Pro usage can incur charges above included credit, including compute, bandwidth, builds, observability and seats.

If Sophis Central is operating commercially, verify that the frontend is on an eligible commercial plan and that billing/spend limits are configured. Do not assume a $20 Pro plan is the final monthly amount.

Source: https://vercel.com/pricing

### 4.3 Neon — PostgreSQL benchmark, only if Neon is the actual DB provider

Neon's current plan documentation describes Free, Launch and Scale:
- Free: 100 CU-hours per project and 0.5 GB storage per project.
- Launch: $0.106 per CU-hour; storage $0.35/GB-month; 500 GB public transfer included per project, then $0.10/GB.
- Scale: $0.222 per CU-hour; storage $0.35/GB-month; 500 GB public transfer included per project, then $0.10/GB.
- Paid plans are usage-based rather than a fixed monthly database price.

The actual bill depends on compute hours/size, storage, network transfer, restore history and plan. Confirm whether the production database is Neon or Render Postgres before including either in the model. Never double-count both.

Source: https://neon.com/docs/introduction/plans

### 4.4 Resend — transactional email benchmark

Resend currently lists:
- Free: $0/month for 3,000 emails/month, with a 100-email daily limit.
- Pro: $20/month for 50,000 emails/month.
- Additional Pro transactional email: $0.90 per 1,000 emails.
- Scale: $90/month for 100,000 emails/month.

The backend's environment contract contains Resend API key, sender, support sender and template variables. This proves configuration support, not that production sender domains/templates are verified or that email is currently being delivered. Measure password reset, verification, support and notification volumes separately.

Source: https://resend.com/pricing

### 4.5 AI providers — variable consumption cost

The repository's default AI model configuration is:
- Groq: `openai/gpt-oss-120b`.
- Gemini fallback: `gemini-3.8-flash`.

Groq's published GPT-OSS 120B price is $0.15 per million input tokens and $0.60 per million output tokens. Gemini 3.8 Flash's Google API pricing is $0.75 per million input tokens and $3.75 per million output tokens through 31 December 2026; Google's published pricing indicates $1.50 / $7.50 from 1 January 2027. Revalidate model pricing and model availability before each budget refresh.

Illustrative token arithmetic (not a usage forecast):
- Groq: 1 million input + 250,000 output tokens = approximately $0.30.
- Gemini fallback: the same token mix = approximately $1.6875 through 31 Dec 2026; approximately $3.375 from 1 Jan 2027.
- If 10% of 10,000 otherwise-Groq requests fell back to Gemini, model cost depends on the actual token mix and fallback retry pattern; track provider usage metadata per request rather than estimating from user counts alone.

The backend limits output to 2,048 tokens, includes recent conversation history, can attach extracted document text (up to 48,000 characters in the AI resource workflow), and uses a configured 8,000-token preflight budget for Groq. This makes document length and history truncation important cost controls. Instrument input/output tokens, provider, model, retry count, fallback rate, latency, failure status and per-user/institution usage. Set provider spend limits and per-user quotas. Never infer provider costs from Wisdom Points alone; points are an internal product charge and not a vendor invoice.

Sources:
- https://console.groq.com/docs/models
- https://ai.google.dev/gemini-api/docs/pricing

### 4.6 Payments — variable transaction cost

Published Nigeria pricing currently shows:
- Paystack local: 1.5% + ₦100; ₦100 waived below ₦2,500; local fee capped at ₦2,000.
- Paystack international: 3.9% + ₦100.
- Paystack transfers: ₦10 up to ₦5,000; ₦25 from ₦5,001 to ₦50,000; ₦50 above ₦50,000.
- Flutterwave local: 2% per transaction (shown as 1.4% transaction fee + 0.6% platform fee).
- Flutterwave international: 4.8%.
- Flutterwave transfer fee schedule: ₦10 up to ₦5,000; ₦25 from ₦5,001 to ₦50,000; ₦50 above ₦50,000.
- Flutterwave states transaction fees are subject to 7.5% VAT.

Example on a ₦10,000 local collection, before any negotiated merchant rate or other adjustments:
- Paystack published local fee: 1.5% × ₦10,000 + ₦100 = ₦250.
- Flutterwave published local fee: 2% × ₦10,000 = ₦200 plus 7.5% VAT on the fee (₦15) = ₦215.

These are provider-published list-price illustrations. Obtain the actual merchant agreement, settlement statements, VAT treatment, transfer fees and refund/dispute charges. Payment fees must be deducted from transaction contribution margin before claiming Wisdom Points top-ups or resource sales are profitable.

Sources:
- https://paystack.com/pricing
- https://flutterwave.com/ng/pricing/

### 4.7 Amazon S3 / S3-compatible object storage

AWS S3 bills can include storage, requests, data retrieval, data transfer, management features and replication. Actual cost depends on region, storage class, stored GB-months, GET/PUT volume, egress, lifecycle and replication. The S3 pricing page gives an example GET request price of $0.0004 per 1,000 requests for S3 Standard, but the Sophis bucket's actual region and class are unknown.

Because uploaded academic PDFs and other resources may be downloaded repeatedly, egress and access patterns can become more material than raw storage. Measure bytes stored, object count, average file size, GET/PUT requests, downloads per resource, and outbound GB by institution. Use lifecycle rules and private/presigned access where compatible with product access policy.

Source: https://aws.amazon.com/s3/pricing/

## 5. Key engineering and financial findings

### Finding A — OCR changes the API resource profile

The Docker runtime installs Poppler and Tesseract. The AI resource flow downloads academic documents, caps input files at 12 MiB, extracts text and may pass up to 48,000 characters as model context. This means a low-memory API instance may become CPU/memory constrained under concurrent document processing. The team should benchmark:
- Text-based PDF extraction versus image/scanned PDF OCR.
- p50/p95 processing time and peak RSS memory per document.
- Concurrent OCR jobs before API latency degrades.
- Worker separation threshold and queue backlog.
- Maximum upload size, decompression safety and temporary disk usage.

Recommended next design step: if OCR measurably competes with interactive API traffic, move document extraction to a bounded background worker/queue with concurrency limits, retries, dead-letter handling and per-institution quotas. Do not add a worker service until load-test evidence justifies it.

### Finding B — PostgreSQL is a core operational dependency

The database contains users, academic resources, institutions, moderation, points, AI sessions/messages, support, chat, analytics, payments, refunds, disputes, payout and reconciliation records. This is a growing transactional workload. Confirm:
- Actual database provider and region.
- Database size and weekly/monthly growth.
- Peak connection count and pool configuration.
- Slow query logs, query plans and index health.
- Backup frequency, retention, PITR availability and restore test date.
- RPO/RTO and operator ownership.
- Data retention and deletion policy for chat, AI history, uploads and payment records.

Production TypeORM synchronization is disabled in the inspected configuration, which is appropriate; migrations and backup/restore controls remain operational responsibilities.

### Finding C — AI fallback can increase per-request cost

The provider service calls Groq first and Gemini when Groq fails. Fallback improves availability but can create additional vendor charges and latency. Track successful primary requests, fallback attempts, retries, token totals and user-facing failures. Define alerts for sudden fallback-rate increases, per-tenant budget ceilings and an operational kill switch for expensive AI features.

### Finding D — Payment capability creates financial operations work

The codebase contains payment transactions, ledger entries, refunds, disputes, adjustments, reconciliation runs, payouts and payout beneficiaries. This is more than a simple checkout integration. Budget for:
- Daily settlement reconciliation and exception review.
- Refund/dispute handling and evidence deadlines.
- Transfer and payout fees.
- Ledger controls and audit retention.
- Payment provider support and incident handling.
- Finance/accounting review and appropriate legal/compliance advice.

Confirm the currently active provider from production configuration. Supporting both providers in code does not mean both are live or that routing/failover is configured.

### Finding E — Production configuration is a material unknown

The repository has no `render.yaml`, `railway.json` or `fly.toml` in the paths inspected, and the environment example contains no billable plan identifiers. This does not prove there is no infrastructure-as-code elsewhere, but it means this repository alone cannot verify live instance sizes, database provider, Redis plan, bucket region, billing owner or production environment values.

Create a sanitized infrastructure inventory from provider dashboards. Never export secrets or commit credentials.

### Finding F — Monitoring is optional in code

Sentry is initialized only if `SENTRY_DSN` is supplied. Verify that production error monitoring is actually enabled, that PII and sensitive academic content are scrubbed, and that alert routing/retention is configured. A dependency in package.json is not evidence of a paid Sentry plan or live monitoring.

## 6. Planning benchmark — not a Sophis Central quote

A minimal production-oriented vendor configuration might involve:
- API compute sized after load testing (Render public list examples range from $7/month for 512 MB to $25/month for 1 CPU / 2 GB).
- A managed Redis-compatible service (Render public example starts at $10/month for 256 MB).
- A managed PostgreSQL plan sized to actual workload (Render examples from $19/month for 1 GB RAM, or Neon usage-based pricing if Neon is the actual provider).
- Commercial frontend hosting where required (Vercel Pro list price $20/month).
- Email delivery (Resend Free within limits or Pro at $20/month).
- S3-compatible storage, AI usage, monitoring and payment fees based on measured consumption.

Do not sum these alternatives as a quote: Render Postgres and Neon are alternative database examples; Render Key Value and another Redis provider are alternatives; the API's actual plan is unknown; Vercel and Resend usage can exceed base plan prices. Actual cost may also include a Render workspace plan, domains, backups, egress, VAT, foreign exchange spread and other subscriptions.

## 7. Capacity test plan for 1k / 5k / 10k / 50k MAU

MAU alone is not a capacity unit. Engineering must define daily active ratio, peak concurrency, request mix, resource-download rate, average file size, OCR percentage, AI requests/user, token distribution and institution-level traffic spikes.

For each MAU checkpoint, run staged load tests and report:
- API throughput, p50/p95/p99 latency, 4xx/5xx rates and CPU/RAM.
- Database connections, CPU, storage, I/O, slow queries and lock waits.
- Redis memory, hit ratio, throughput and eviction.
- OCR job throughput, p95 completion time, memory and queue depth.
- Storage GB, GET/PUT requests and egress.
- AI input/output tokens, provider fallback percentage and USD cost.
- Email sends, delivery/bounce rates and cost.
- Payment count/value, fees, refunds, disputes and payout volume.
- Monthly cost in USD and NGN with dated FX source.
- Upgrade threshold, mitigation and owner.

Use production-like anonymized data and test environments. Do not load-test production without an approved window, rate limits and rollback plan.

## 8. Financial model inputs to request from engineering

The engineering lead should supply these records:
1. Current hosting provider invoices and service identifiers for API, web, database, Redis and workers.
2. Current plan/tier, region, CPU/RAM, storage, bandwidth, included quota and overage rate for each.
3. Database size, growth, connection peak, backup retention and restore evidence.
4. Object storage provider, region, stored GB, requests, egress and lifecycle policy.
5. AI provider monthly invoices/usage export, token totals by model, fallback rate and spend limits.
6. Email provider plan, sends/month, deliverability and verified sender status.
7. Sentry/monitoring plan and event volume.
8. GitHub Actions usage, paid seats and any code-assistance subscriptions.
9. Domains, DNS, certificates, mobile publishing/signing costs if applicable.
10. Engineering/QA/DevOps/customer-support time and fully loaded monthly cost.
11. Third-party integration costs, one-time implementation and ongoing maintenance.
12. Actual payment provider contract, settlement statements, fees, refund/dispute and transfer costs.

Finance/founder must additionally provide actual cash, committed funding, salaries/contractor agreements, legal/accounting/tax costs, commercial pipeline, signed contracts, customer prices, collections and receivables.

## 9. Immediate actions and priority

| Priority | Action | Owner | Evidence required |
|---|---|---|---|
| P0 | Confirm live provider topology and billing owners | Engineering lead | Sanitized provider inventory |
| P0 | Export last 3 months of invoices and usage | Engineering + finance | Invoices and usage CSVs |
| P0 | Confirm production DB provider, plan, size, backup and restore | Backend/DB owner | Dashboard evidence and restore record |
| P0 | Confirm AI provider model IDs, usage billing and budget limits | AI/backend owner | Provider usage exports and configuration verification |
| P0 | Confirm payment provider currently selected and merchant fee schedule | Finance/payments owner | Contract and settlement statement |
| P1 | Benchmark OCR/API concurrency and memory | Backend/QA | Load-test report |
| P1 | Instrument AI and storage cost per institution | Backend/data | Usage dashboards |
| P1 | Validate Sentry and email production configuration | Operations | Sanitized screenshots/config status |
| P1 | Define 1k/5k/10k/50k MAU workload profiles | Product + engineering | Explicit workload assumptions |
| P2 | Decide worker separation, autoscaling and redundancy | Engineering | Measured bottleneck and cost/benefit analysis |
| P2 | Approve staged hiring and support capacity | Founder | Role triggers and budget |

## 10. What is still not verified

This research cannot establish:
- Actual current monthly or annual infrastructure/software spend.
- Exact Render service size, workspace plan, database provider, Redis plan or production region.
- Current Vercel plan, included usage or overage.
- Current Resend plan, email volume, sender-domain verification or monthly invoice.
- Groq/Gemini invoices, monthly token volume, fallback rate or provider spend limits.
- Active Paystack/Flutterwave provider, merchant-specific rates, settlement history or refund/dispute fees.
- S3 bucket region, storage volume, egress or request counts.
- Current production MAU, peak concurrency, user acquisition cost or support workload.
- Current staff/contractor payroll and hiring budget.
- Signed institutional contracts, validated subscription prices, revenue, cash position or funding commitments.

Until these records are supplied, the funding requirement should remain a formula and a scenario model—not a made-up headline number.

## 11. Public sources and pricing references

All accessed 28 November 2026; confirm again before contracting or publishing investor numbers.

- Render pricing: https://render.com/pricing
- Vercel pricing: https://vercel.com/pricing
- Neon plans and unit pricing: https://neon.com/docs/introduction/plans
- Resend pricing: https://resend.com/pricing
- Groq supported models and GPT-OSS 120B token price: https://console.groq.com/docs/models
- Google Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Paystack Nigeria pricing: https://paystack.com/pricing
- Flutterwave Nigeria pricing: https://flutterwave.com/ng/pricing/
- Amazon S3 pricing: https://aws.amazon.com/s3/pricing/

## 12. Decision

The immediate funding exercise should proceed in this order:

1. Collect private billing and usage evidence.
2. Verify production topology and current reliability.
3. Measure real workloads and unit costs.
4. Validate institutional pricing and paid demand.
5. Build conservative/base/growth 12-month cash forecasts.
6. Calculate funding needed to reach a defined milestone, including a contingency and minimum cash buffer.

This sequence protects Sophis Central from overstating readiness, underestimating operating costs or asking investors for a number that cannot be defended.
