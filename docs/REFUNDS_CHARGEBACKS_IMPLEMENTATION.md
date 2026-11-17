# Refunds and Chargebacks — Implementation Plan

## Status

This document defines the first implementation slice for Sophis Central payments. It is a design/acceptance contract, not evidence that refund or dispute processing is implemented. The PR remains a draft until the application code, migrations, tests, and staging verification are complete.

## Scope

Implement provider-backed refunds and chargeback/dispute lifecycle handling for the existing Paystack adapter and provider-neutral payment architecture.

### Refund lifecycle

Support partial and full refunds in NGN minor units. A refund request must reference an existing successful payment and must not exceed the remaining refundable amount.

Persist each refund with:
- Internal immutable refund ID and unique idempotency/reference key
- Payment and provider transaction references
- Requested amount and currency
- Provider refund ID/reference when available
- Status, provider response metadata (redacted), requester, reason, timestamps
- Failure/needs-attention details safe for operational review

Expected provider states include pending, processing, needs-attention, failed, and processed. An API acceptance response is not proof of a completed refund. Only a verified provider status update may mark a refund processed. Failed refunds must not leave a permanent reversal in the ledger.

### Authorization and safety

- Only authorized admin/moderator roles may initiate or retry refunds; verify actual role policy before implementation.
- Never accept a client-supplied amount as authoritative. Calculate remaining refundable amount from persisted successful payments and processed/pending refund reservations under a database transaction/row lock.
- Enforce idempotency and prevent concurrent requests from exceeding the original payment.
- Verify webhook signatures against the raw request body, validate provider and payment references, and process events idempotently.
- Do not expose provider secrets, raw sensitive payloads, or customer bank details in logs or API responses.
- Keep all amounts in integer minor units and validate currency equality.

### Entitlement and ledger treatment

- A pending/processing refund reserves the corresponding refundable amount; it does not by itself prove money has returned.
- A processed full refund revokes the associated paid-resource entitlement.
- A processed partial refund follows an explicit entitlement policy; do not automatically revoke access unless the product policy says so.
- Reverse the corresponding lecturer/platform allocation proportionally and idempotently only when the provider confirms the refund is processed.
- A failed refund releases its reservation and leaves the original purchase entitlement and ledger allocation intact.
- A chargeback/dispute opening places the disputed allocation on hold and flags the purchase for review. Do not treat dispute creation as a final loss.
- A resolved dispute must release or reverse the hold according to the provider's verified outcome.

### Chargebacks and disputes

Persist provider dispute ID, related payment, amount/currency, status, reason/category, response deadline, evidence references, resolution, and timestamps. Process dispute-created, reminder, and resolved events. Provide authorized operational retrieval and evidence workflow. Any provider action to accept/decline a dispute must be an explicit authorized operation with an audit record; never auto-accept or auto-decline.

### Provider contract

Extend the provider-neutral interface with explicit refund/dispute capabilities (or capability detection) without breaking existing Paystack transaction initialization/verification. Unsupported capabilities must fail closed with a clear domain error. Implement Paystack using its documented Refunds and Disputes APIs and webhook events.

References:
- https://paystack.com/docs/api/refund/
- https://paystack.com/docs/payments/refunds/
- https://paystack.com/docs/payments/manage-disputes/
- https://paystack.com/docs/api/dispute/
- https://paystack.com/docs/payments/webhooks/

## Acceptance criteria

1. Database migrations persist refunds and disputes with appropriate foreign keys, unique constraints, indexes, and safe status transitions.
2. Authorized refund initiation supports full and partial refunds, validates remaining refundable amount, and is idempotent under concurrent requests.
3. Provider acceptance remains pending/processing; only verified provider confirmation marks a refund processed.
4. Webhook signature verification, replay protection/idempotency, event validation, and duplicate delivery handling are implemented.
5. Failed/needs-attention refunds are recoverable without corrupting purchase access or ledger balances.
6. Full and partial refund entitlement rules are explicit, tested, and enforced.
7. Dispute creation places the appropriate lecturer allocation on hold; verified resolution releases or reverses it correctly.
8. All financial ledger mutations are transactional, balanced, traceable, and idempotent.
9. Tests cover duplicate requests/events, concurrency, partial/full refunds, provider failures, invalid signatures, amount/currency/reference mismatch, and dispute resolution.
10. Staging verification uses real API, database, Paystack test mode, and configured webhook delivery. No mocked provider/database test is presented as staging proof.

## Out of scope for this slice

- Scheduled reconciliation
- Automated lecturer payouts/transfers
- Second payment provider

These will be separate implementation phases after this lifecycle is merged and verified.
