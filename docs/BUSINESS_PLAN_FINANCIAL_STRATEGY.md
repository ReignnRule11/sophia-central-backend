# Sophis Central — Business, Financial Sustainability and Funding Strategy

**Status:** Planning document; assumptions and commercial inputs require validation.  
**Operating currency:** Nigerian naira (NGN). USD equivalents are for international comparison and fundraising only.  
**Scope:** First 12 months of commercial execution, with a staged path to scale.

## 1. Executive summary

Sophis Central is an academic resource and research platform serving students, lecturers, moderators, reviewers and institutional administrators. The backend repository documents a NestJS API, PostgreSQL persistence, authentication and onboarding, academic resource workflows, moderation/governance, Redis, object storage integration and an AI-provider integration boundary.

The commercial strategy should prioritize institution-funded adoption and paid institutional services. Student-facing paid features can complement this model, but core academic access and trust should not depend on forcing students to pay for essential institutional workflows.

This document is a decision framework, not a claim that revenue, customers, contracts, prices or funding have already been secured. No verified pricing, paying-customer count, signed institutional pipeline, hosting invoices, payroll budget or funding commitment was supplied when this document was prepared. Those inputs must be collected before publishing a numeric forecast externally.

## 2. Customer segments and value propositions

| Segment | Potential value | Commercial approach to validate |
|---|---|---|
| Universities, colleges and other institutions | Governed academic resources, institutional visibility, moderation workflows, adoption support and reporting | Annual institutional subscription or tiered licence |
| Departments and faculties | Department-level resource management and academic workflow support | Department/faculty plan where institution-wide procurement is not yet feasible |
| Lecturers and academic contributors | Structured resource submission, review and distribution | Institution-sponsored access; optional professional tools only after demand validation |
| Students | Discover approved academic resources and use supported learning features | Free core access; optional premium features only where they provide clear incremental value |
| Institutional administrators | Governance, auditability, administration and operational oversight | Higher-tier institutional plan and paid implementation/support |
| Integration partners | Approved interoperability and workflow integration | Scoped implementation fees and/or recurring integration support |

## 3. Revenue model: priorities and guardrails

### Priority 1 — Institutional subscriptions

Validate annual contracts with transparent tiers based on institution size, enabled modules, support level and service commitments. Avoid pricing solely on registered accounts until usage, infrastructure costs and willingness to pay are measured.

Potential tier dimensions:
- Number of active students, lecturers or departments.
- Resource storage and usage allowances.
- Moderation and governance capabilities.
- Administrative reporting and analytics.
- Support response times and onboarding assistance.
- Integration requirements and data-export needs.

### Priority 2 — Onboarding, training and implementation

Charge for clearly scoped services such as data import, administrator training, workflow configuration, migration support and launch assistance. Separate one-time implementation fees from recurring subscriptions.

### Priority 3 — Premium institutional capabilities

Consider advanced analytics, institution-specific integrations, enhanced support and service-level commitments when they are implemented, supportable and demonstrably valuable.

### Priority 4 — Optional student or lecturer upgrades

Test optional paid enhancements only after user research. Keep essential academic access, safety, privacy and fair review processes independent of payment. Do not assume AI features are profitable: provider usage, abuse controls and support costs must be measured.

### Priority 5 — Partner/API revenue

Treat API access, integrations and partner programmes as later-stage opportunities. They require documented API stability, permission boundaries, partner demand, support ownership and commercial/legal terms.

## 4. Packaging and pricing research

Do not publish prices until the team has:
1. Interviewed a representative set of institutional decision-makers and end users.
2. Identified the budget owner, procurement cycle and purchasing constraints.
3. Tested willingness to pay using comparable package descriptions.
4. Estimated direct service costs per institution and per active user.
5. Modelled discounts, taxes, payment processing, collections delays and renewal risk.
6. Defined contract scope, data processing responsibilities, support limits and renewal terms.

For each proposed tier, record: target buyer, included capabilities, excluded capabilities, billing unit, proposed NGN price, optional USD reference, direct cost to serve, gross margin, support burden, evidence source, confidence level and next validation date.

## 5. Funding requirement and use of funds

The funding ask should be derived from an approved operating plan, not selected first and reverse-engineered. Use:

**Funding required = 12-month operating costs + approved growth investment + contingency − forecast cash receipts − available unrestricted capital.**

Separate:
- **One-time costs:** security assessment, legal setup, initial integration work, migration, launch materials and equipment.
- **Fixed recurring costs:** hosting baseline, core software subscriptions, accounting, retained support and staff/contractor commitments.
- **Variable costs:** storage, bandwidth, database capacity, email/SMS, payment processing, AI usage, support volume and usage-based integrations.
- **Growth investment:** implementation capacity, sales/customer success, marketing experiments and capacity upgrades.
- **Contingency:** an explicitly approved reserve based on risk and forecast uncertainty.

Funding milestones should be tied to evidence:
1. **Product and operational readiness:** secure core workflows, reliable deployments, backups, observability, support process and verified cost baseline.
2. **Market validation:** pilot institutions, active usage, user feedback, willingness-to-pay evidence and at least one repeatable acquisition/implementation path.
3. **Commercial expansion:** signed/renewing contracts, predictable onboarding, measurable retention and a cost-to-serve profile that supports scaling.

The use-of-funds schedule should show amount, currency, timing, owner, milestone, evidence of completion and whether the expense is one-time or recurring.

## 6. First-year operating priorities

- Establish a reliable baseline of active users, institutions, resource activity and service consumption.
- Convert qualified institutional interest into structured discovery, pilots and paid agreements.
- Track onboarding time, support tickets, activation, retention and renewal intent.
- Instrument infrastructure and third-party usage before enabling high-cost features broadly.
- Review actual-versus-budget performance monthly.
- Avoid hiring ahead of validated demand; use scoped contractors or shared roles where practical.
- Protect security, privacy, academic integrity and data portability as non-negotiable product requirements.

## 7. Scaling the team

A lean first-stage team can combine responsibilities, provided ownership is explicit:
- Product/business lead: roadmap, customer discovery, partnerships, commercial decisions and reporting.
- Backend engineering: API, database, integrations, security and operational reliability.
- Frontend/mobile engineering: user experience, accessibility, client integrations and release management.
- QA/release ownership: automated tests, regression checks and release evidence.
- Institutional implementation/customer success: onboarding, training, support and renewals.

Add capacity in response to measured bottlenecks:
- DevOps/SRE or cloud engineering when reliability, deployment or capacity work exceeds the engineering team's sustainable allocation.
- Customer success/implementation when onboarding and support volume constrain adoption.
- Business development when the institutional sales process is repeatable enough to scale.
- Security/privacy specialist when data sensitivity, institutional procurement or regulatory obligations require independent expertise.
- Data/AI engineering only when validated product use cases justify the ongoing provider and governance costs.

Do not present proposed roles as current employees or confirmed hires. Document employment type, start trigger, monthly fully loaded cost and expected measurable output.

## 8. Governance and reporting

Maintain a monthly operating review with:
- Revenue recognized and cash collected, reported separately.
- Contracted recurring revenue and renewal pipeline.
- Active institutions and active users by role.
- Activation, retention and resource workflow completion.
- Gross margin and cost to serve by institution.
- Hosting, database, storage, messaging, payment and AI costs.
- Payroll/contractor commitments, cash burn and runway.
- Incidents, security actions, support volume and service availability.
- Forecast-versus-actual variance and corrective actions.

## 9. Risks and controls

| Risk | Control |
|---|---|
| Weak willingness to pay | Buyer interviews, paid pilots and renewal evidence before scaling sales spend |
| Unpredictable infrastructure costs | Usage metering, budgets/alerts, quotas and capacity thresholds |
| AI cost or quality volatility | Explicit feature gating, provider fallback strategy, per-user limits and quality monitoring |
| Institutional procurement delays | Multiple qualified opportunities, staged pilots and cash runway planning |
| Security/privacy incident | Least privilege, encryption, audit trails, tested backups, incident response and appropriate legal review |
| Over-hiring | Milestone-triggered hiring and contractor-first specialist capacity |
| Revenue concentration | Track concentration by institution and diversify customer pipeline |

## 10. Evidence required before investor circulation

The founder and technical team must complete the financial model and technical assessment in this documentation set. Every external claim should be labelled as one of: **verified actual**, **contracted**, **pipeline**, **assumption**, or **target**. Include source, owner and date for material inputs. Do not represent pilots as paid contracts, projected users as active users, or planned integrations as live integrations.
