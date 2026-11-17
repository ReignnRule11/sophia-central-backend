# Lecturer Payouts — Operations

## Workflow endpoints

Lecturers:
- `POST /payments/payouts/beneficiary` — verify and save a Nigerian NUBAN beneficiary. Body: `{ "accountNumber": "0123456789", "bankCode": "058" }`.
- `GET /payments/payouts/balance` — available NGN lecturer earnings in kobo.
- `POST /payments/payouts` — request a payout. Body: `{ "amountMinor": "500000" }`. This reserves funds but does not initiate a transfer.

Administrators/moderators:
- `GET /payments/payouts/requests`
- `POST /payments/payouts/:id/approve`
- `GET /payments/payouts/verify/:reference`
- `POST /payments/payouts/reconciliation/run` — body: `{ "from": "2026-11-01T00:00:00.000Z", "to": "2026-11-02T00:00:00.000Z" }`.
- `GET /payments/payouts/reconciliation/history`

All operator endpoints require JWT authentication and admin/moderator role. Reconciliation is read-only, limited to a maximum 31-day UTC range, and compares only `sophis-payout-` references so unrelated transfers in a shared Paystack account are not reported as false positives. Newly requested payouts are excluded until a provider transfer has been initiated.

## Transfer webhooks

Configure the Paystack webhook URL as:

`https://YOUR_API_HOST/payments/webhooks/paystack`

Subscribe to:
- `transfer.success`
- `transfer.failed`
- `transfer.reversed`

Configure `PAYSTACK_WEBHOOK_SECRET` using the signing secret from the Paystack dashboard. The API validates the timestamped `Paystack-Signature` against the raw request body (including the 300-second timestamp window and constant-time signature comparison). The legacy `x-paystack-signature` path remains supported while Paystack transitions signing modes.

For each transfer event, Sophis Central:
1. Locates the payout by its unique provider reference.
2. Calls Paystack's transfer verification endpoint rather than trusting the event payload as the financial source of truth.
3. Confirms reference, amount and currency.
4. Applies only verified status changes under a database row lock.
5. Ignores duplicate or stale terminal events. A verified reversal may move a previously successful payout to reversed.

Unknown transfer references are acknowledged but do not create payout records. Provider verification failures return an error so Paystack can retry delivery.

## Financial controls

- Payout requests are reserved immediately and remain reserved while requested, processing, pending or OTP.
- Approval is separate from lecturer request; the lecturer cannot approve their own payout.
- Available balance starts from successful lecturer-share ledger entries, subtracts lecturer refund adjustments, and conservatively holds the full lecturer allocation for any payment with an open/under-review dispute.
- Successful payouts remain deducted; failed/reversed payouts release the reservation.
- A provider timeout is an uncertain outcome. The payout remains reserved; verify the original reference before any retry.
- Only NGN/NUBAN bank accounts are enabled.
- Raw account numbers are not persisted by Sophis Central.

## Deployment and staging verification

1. Configure Paystack test-mode `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET`.
2. Run database migrations before deploying the API.
3. Set the webhook URL in the Paystack **test-mode** dashboard and subscribe to the three transfer events above.
4. Use a verified test beneficiary and confirm the Paystack test account has transfer capability.
5. Run a real test-mode payout through request, approval, provider transfer, webhook delivery and operator verification.
6. Run payout reconciliation for the same UTC window; inspect the persisted report and resolve every discrepancy.
7. Confirm webhook delivery in Paystack's dashboard. A green CI run is not evidence that a real provider transfer or webhook was completed.

Do not enable live payouts until test-mode transfer lifecycle, webhook signature validation, idempotency, reconciliation and operational approval have all been demonstrated.
