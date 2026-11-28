# Sophis Central — 12-Month Financial Model Framework

**Currency convention:** NGN is the operating and reporting currency. USD is a secondary investor-reference currency.  
**Model status:** Framework awaiting verified commercial, cost and FX inputs. It intentionally contains no fabricated prices, customer counts or expense totals.

## 1. Model rules

1. Keep assumptions separate from actuals and signed commitments.
2. Record amounts in NGN; retain source currency and conversion details for foreign-currency expenses.
3. Record the FX rate, source and date used for every USD conversion. Refresh it at each monthly close and for fundraising materials.
4. Separate recognized revenue from cash collected; account for payment delays, refunds, taxes and bad debt where applicable.
5. Separate one-time implementation revenue from recurring subscription revenue.
6. Model monthly cash flow, not only annual totals.
7. Use conservative, base and growth cases. Each case must state its drivers and evidence.
8. Exclude unimplemented features and unsigned deals from contracted revenue.

## 2. Inputs to collect

| Input | Required detail | Evidence owner |
|---|---|---|
| Current customers | Paying institutions, signed contracts, contract dates and status | Founder/commercial lead |
| Pipeline | Qualified opportunities, stage, decision maker, expected close date and probability rationale | Founder/commercial lead |
| Pricing | NGN price, billing frequency, tier, discount and included usage | Founder/commercial lead |
| User base | Registered and monthly active users by role and institution | Product/engineering |
| Usage | Storage, bandwidth, database load, AI calls/tokens, messages and support volume | Engineering |
| Existing costs | Hosting, database, Redis, storage, domains, email/SMS, payment, monitoring, AI and licences | Engineering/finance |
| People costs | Employees, contractors, stipends, role, monthly cost and start date | Founder |
| Commercial costs | Sales, travel, marketing, onboarding and training | Founder |
| Finance/legal | Accounting, tax, legal, compliance, insurance and payment charges | Founder/adviser |
| Cash position | Unrestricted cash, committed funding, receivables and payables | Founder/finance |
| FX | Dated NGN/USD rate and source; identify foreign-currency liabilities | Finance |

## 3. Revenue schedule

Create one row per month and revenue stream.

Suggested streams:
- Institutional recurring subscriptions.
- Department/faculty subscriptions, if validated.
- One-time onboarding and implementation.
- Training and support services.
- Optional premium upgrades.
- Integration/API services, only when commercially validated and available.

For each stream calculate:
- Number of paying customers or units.
- New customers, churned customers and retained customers.
- Contracted monthly/annual value.
- Recognized revenue for the month.
- Cash collected for the month.
- Discounts, refunds, taxes and payment fees.
- Deferred revenue where applicable.

**Institutional subscription revenue (monthly approximation) = active paid institutions × monthly equivalent contract price.**

For annual prepayments, model cash receipt separately from monthly revenue recognition. Confirm accounting treatment with a qualified accountant.

## 4. Expense schedule

Classify every line as fixed, variable, one-time or growth investment.

| Category | Example line items | Cost driver |
|---|---|---|
| Cloud/runtime | API hosting, frontend hosting, compute, bandwidth, logs | Instances, compute, traffic and retention |
| Data services | PostgreSQL, Redis, backups, replicas, connection capacity | Database size, connections, I/O and backup retention |
| File storage | MinIO/S3-compatible storage, egress and lifecycle policies | GB stored, requests and downloads |
| Communications | Email, SMS, push/OTP services | Messages and delivery region |
| Payments | Gateway charges, settlement, refunds and chargebacks | Transaction count and value |
| AI providers | Model/API calls, embeddings and moderation | Requests, tokens and model selection |
| Engineering tools | Source control, CI, error monitoring, security scanning and design tools | Seats, build minutes and retention |
| People | Engineering, QA, product, support, sales and operations | Headcount, contractor days and start dates |
| Go-to-market | Research, campaigns, events, travel, sales commissions | Campaign and acquisition activity |
| Professional services | Legal, accounting, tax, security review and compliance | Engagement scope and frequency |
| Contingency | Approved reserve | Risk-adjusted budget |

Record provider, plan, billing currency, current invoice, included quota, overage rate, renewal date, owner and cancellation/upgrade conditions. Do not assume a free tier remains free or suitable at scale.

## 5. Scenario construction

Build three scenarios by changing explicit drivers rather than applying arbitrary percentage multipliers.

### Conservative
- Slow institutional conversion and longer procurement cycles.
- Limited paid pilots and slower renewal evidence.
- Minimal hiring; defer non-essential growth spend.
- Infrastructure upgrades only when measured thresholds require them.

### Base
- Conversion based on qualified pipeline and validated sales-cycle assumptions.
- Revenue based on agreed pricing tests and signed/credible opportunities.
- Hiring only against defined workload or customer-success triggers.
- Variable costs linked to measured usage per active institution/user.

### Growth
- Faster conversion supported by a documented acquisition channel and delivery capacity.
- Additional onboarding and support capacity budgeted before customer volume arrives.
- Capacity upgrades and variable provider costs scaled with usage.
- Increased sales/marketing spend tied to measured acquisition efficiency.

For every scenario document customer starts, churn/renewals, pricing, implementation volume, active usage, staffing dates and infrastructure thresholds.

## 6. Core formulas

- **Ending paid institutions** = beginning paid institutions + new paid institutions − churned institutions.
- **Monthly recurring revenue (MRR)** = sum of active recurring contract monthly equivalents.
- **Annual recurring revenue (ARR)** = MRR × 12 (a run-rate metric, not cash collected).
- **Gross profit** = recognized revenue − direct cost of service.
- **Gross margin** = gross profit ÷ recognized revenue, where revenue is positive.
- **Operating result** = gross profit − operating expenses.
- **Net cash movement** = cash collected − cash operating payments − capital/growth payments.
- **Ending cash** = beginning cash + net cash movement + financing received.
- **Runway (months)** = available cash ÷ average forward monthly net cash burn, only when burn is positive and the average is representative.
- **Customer acquisition cost (CAC)** = attributable sales and marketing acquisition spend ÷ new paying customers acquired in the same defined cohort/period.
- **Revenue per institution** = recognized institutional revenue ÷ average active paying institutions.
- **Cost to serve** = direct support and infrastructure cost attributable to a customer/institution.
- **Break-even revenue** = fixed operating costs ÷ contribution margin ratio, where contribution margin ratio is positive and assumptions are stable.

Funding need should be calculated from the month-by-month cash deficit, minimum cash buffer and milestone-based growth investment—not merely from the annual accounting loss.

## 7. Monthly model layout

Create 12 monthly columns plus annual total and notes. Recommended sections:

1. Opening cash.
2. Customer counts and pipeline conversions.
3. Revenue by stream (recognized and collected).
4. Direct cost of service.
5. Gross profit and gross margin.
6. Payroll and contractors.
7. Product/cloud/software costs.
8. Sales, marketing and implementation.
9. Legal, finance, administration and compliance.
10. One-time investments and contingency.
11. Operating result and net cash movement.
12. Funding receipts, closing cash and runway.
13. Actual-versus-budget variance once operations begin.

## 8. NGN and USD reporting

- Maintain the source ledger in NGN for domestic operations.
- For each USD-denominated vendor bill, record the invoice currency and NGN settlement amount.
- For investor summaries, show NGN first and USD equivalent second.
- State the FX source, timestamp/date and rate in every exported investor model.
- Do not use an undated exchange rate or imply a fixed peg.
- Stress-test the plan for NGN depreciation and foreign-currency vendor price increases.

## 9. Monthly close checklist

- Reconcile bank, gateway settlements, invoices and receivables.
- Confirm subscription status, cancellations, refunds and renewals.
- Import actual vendor bills and usage reports.
- Reconcile payroll and contractor invoices.
- Update pipeline stages using evidence, not optimism.
- Compare actuals to budget and explain material variance.
- Update FX assumptions and cash runway.
- Record forecast changes, owner, date and reason.

## 10. Approval gate

A forecast is investor-ready only after:
- Current actual costs are supported by invoices or provider dashboards.
- Pricing and customer assumptions have evidence and named owners.
- The 12-month cash schedule reconciles.
- Conservative/base/growth cases are internally consistent.
- Taxes, payment fees, collections delays and currency exposure are considered.
- The founder and finance reviewer approve the assumptions and funding ask.
