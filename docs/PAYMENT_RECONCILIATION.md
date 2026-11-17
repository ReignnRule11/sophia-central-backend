# Payment Reconciliation — Operations

## Purpose

The reconciliation runner compares persisted Sophis Central payment and refund records with Paystack's transaction and refund lists. It is an operator-triggered, read-only control. It does not create purchases, change payment/refund states, or post ledger adjustments.

## API

All routes require an authenticated administrator or moderator.

### Run a reconciliation

`POST /payments/reconciliation/run`

```json
{
  "from": "2026-11-17T00:00:00.000Z",
  "to": "2026-11-18T00:00:00.000Z"
}
```

- UTC ISO-8601 timestamps are required.
- The range is half-open: from inclusive, to exclusive.
- Maximum range: 31 days.
- Paystack transaction and refund lists are paginated at 100 records/page.
- Safety cap: 10,000 records per resource type per run.
- Reports are persisted in `payment_reconciliation_runs`.

### Read recent reports

`GET /payments/reconciliation/history`

Returns the latest 50 reports, including discrepancy details.

## Discrepancy types

- `local_payment_missing_at_provider`
- `provider_payment_missing_locally`
- `payment_mismatch` (status, amount or currency)
- `local_refund_without_provider_id`
- `local_refund_missing_at_provider`
- `provider_refund_missing_locally`
- `refund_mismatch` (status, amount or currency)

A provider-side record absent locally is not automatically imported. An unmatched local record is not automatically failed or reversed. Operators must inspect the provider dashboard and source transaction before taking a corrective action.

## Safety

- Reconciliation never changes payments, purchases, refunds, entitlements or ledger entries.
- Provider errors fail the run; partial provider data is not persisted as a completed report.
- Provider credentials are read from the existing secret configuration and are never returned.
- Use Paystack test keys in staging. Do not validate against live customer funds.
- Reconcile short periods during initial rollout; investigate every discrepancy before enabling any future automated repair workflow.

## Provider API

Uses Paystack's authenticated, paginated `GET /transaction` and `GET /refund` endpoints with `from`, `to`, `perPage`, and `page`.
