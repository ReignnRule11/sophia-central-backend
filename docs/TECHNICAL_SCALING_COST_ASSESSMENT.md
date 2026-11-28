# Sophis Central — Technical Scaling and Cost Assessment

**Purpose:** Obtain a verifiable technical and financial baseline from the engineering team before committing to a 12-month budget or funding ask.

## 1. Known architecture baseline

The repository README currently describes:
- NestJS and TypeScript API.
- PostgreSQL with TypeORM migrations.
- Redis.
- MinIO / S3-compatible object-storage integration.
- OpenAI-compatible AI-provider integration.
- Swagger/OpenAPI.
- Related web client in the Sophis Central frontend repository.

This is a repository-documented technology baseline, not proof that every service is configured, paid for, healthy or production-scaled. Confirm actual production providers, regions, plans, resource limits, versions and environment configuration. Do not disclose secrets in this assessment.

## 2. Required engineering inventory

For each component record: service/provider, purpose, environment, region, plan/tier, resource allocation, current utilization, monthly invoice, billing currency, included quota, overage rate, renewal date, owner, backup/failover plan and scale trigger.

### Runtime and delivery
- API hosting/runtime, CPU, memory, replicas, autoscaling and bandwidth.
- Web hosting/CDN, build minutes, bandwidth and edge/runtime usage.
- CI/CD minutes, artifact retention and deployment environments.
- Domain, DNS, TLS and certificate renewal.
- Mobile build/signing/distribution costs, if applicable.

### Data and storage
- PostgreSQL plan, CPU/RAM, storage, IOPS, connection limits, connection pooling, backups, retention and restore tests.
- Redis plan, memory, persistence, eviction policy and availability.
- Object storage provider, capacity, egress, request charges, lifecycle rules and private access controls.
- Migration execution, schema growth and data-retention costs.

### Security and reliability
- Authentication, MFA and secrets management.
- Encryption in transit/at rest and key rotation.
- Audit logging, monitoring, alerting and error tracking.
- Vulnerability scanning, dependency updates and penetration/security assessment.
- Backup restore tests, incident response and recovery objectives (RPO/RTO).
- Rate limiting, abuse prevention, upload scanning and role/tenant isolation.
- Privacy, data export/deletion and institutional data-processing requirements.

### Third-party services
- Email, OTP, SMS and push notifications.
- Payment gateway and settlement/reconciliation services.
- AI model/API usage, embeddings and moderation.
- Analytics, customer support and CRM.
- Institution identity/SSO or other integrations.
- Software licences and paid developer/productivity tools.

For every integration identify whether it is implemented, configured, tested in staging, verified in production, or merely planned.

## 3. Capacity and cost scenarios

Engineering should provide evidence-based estimates at these planning checkpoints: current observed baseline, 1,000, 5,000, 10,000 and 50,000 monthly active users. These are test scenarios, not current user counts or commitments.

For each checkpoint estimate:
- Concurrent users and peak request rate.
- API CPU/memory/replica requirements.
- Database connections, query volume, storage and backup growth.
- Redis memory and throughput.
- Object storage, downloads and egress.
- AI requests/tokens per active user and provider cost.
- Email/SMS/push volume.
- Payment transactions and provider fees.
- Monitoring/log retention and support load.
- Monthly NGN cost and source currency for each service.
- Required engineering/operations effort and likely bottlenecks.

Do not scale cost linearly without explaining fixed tiers, included quotas, volume discounts, connection limits and step-function upgrades. State the assumptions behind user activity, file sizes, download frequency and AI usage.

## 4. Cost classification

Label every cost:
- **One-time:** setup, migration, audit, implementation or equipment.
- **Fixed recurring:** base plans, domains, licences and retainers.
- **Usage-based:** compute overages, storage, egress, AI, messaging and transaction fees.
- **Scale-triggered:** plan upgrades, replicas, database tier, support coverage or security services.
- **Optional/deferred:** tools or capabilities not required for the next milestone.

For each cost provide current invoice/quote, billing currency, NGN conversion date/rate, owner, renewal date and cancellation/alternative options.

## 5. Reliability and release requirements

Before a growth campaign, engineering should document:
- Production and staging topology, data flow and trust boundaries.
- Load-test method, workload profile, results and tested capacity.
- Database index/query review and connection-pool configuration.
- Backup frequency, retention and a successful restore exercise.
- Alert thresholds, on-call/incident owner and escalation path.
- Deployment rollback procedure and migration safety.
- Dependency and container/image update policy.
- Security test results and remediation ownership.
- API rate limits, upload limits and abuse controls.
- Observed availability/error rate and monitoring window.

Passing CI is not equivalent to load-test evidence or production readiness. Record actual deployment and provider verification separately.

## 6. Developer response template

Complete one row per service or resource.

| Field | Engineering response |
|---|---|
| Component/service | |
| Current provider and plan | |
| Environment and region | |
| Implemented/configured/production-verified status | |
| Current monthly bill and currency | |
| Included quota and usage to date | |
| Overage/transaction pricing | |
| Current resource utilization | |
| Estimated cost at 1k / 5k / 10k / 50k MAU | |
| Upgrade trigger and required change | |
| One-time implementation cost | |
| Recurring monthly/annual cost | |
| Main operational/security risk | |
| Cheaper viable alternative and trade-off | |
| Evidence link or invoice/dashboard date | |
| Responsible owner | |

### Questions for the developers

1. What services are actually running in production today, and which are only present in code?
2. What are the exact current monthly and annual infrastructure/software costs?
3. Which subscriptions renew soon, and what are their limits and overage charges?
4. What are the first bottlenecks likely to appear as usage grows?
5. What changes are needed to support 1k, 5k, 10k and 50k monthly active users?
6. Which costs are fixed, variable, one-time or scale-triggered?
7. What security, backup, monitoring, compliance and support work is required before onboarding institutions?
8. Which integrations are essential for the next stage, and what do they cost to implement and operate?
9. What engineering capacity is required, for how long, and at what monthly cost?
10. What can safely be deferred without increasing material operational or security risk?

## 7. Acceptance criteria for the assessment

The assessment is complete when:
- Every production dependency is listed and has a named owner.
- Current costs are supported by invoices, dashboards or written quotes.
- Usage estimates disclose their assumptions and method.
- Scale checkpoints include both cost and architecture changes.
- One-time and recurring costs are separated.
- Security/reliability work is prioritized with effort and owner.
- Risks and upgrade thresholds are explicit.
- The founder can transfer the approved totals into the financial model without guessing.

## 8. Security note

Never place API keys, passwords, tokens, private URLs containing credentials, database connection strings, personal data or unredacted invoices in this repository. Link to access-controlled records where necessary and publish only sanitized evidence.
