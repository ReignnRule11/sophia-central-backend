# Sophis Central payments setup

## Architecture

The application uses a provider-neutral `PaymentProvider` contract and a provider registry. Paystack and Flutterwave adapters are registered. `PAYMENT_PROVIDER=paystack` or `PAYMENT_PROVIDER=flutterwave` selects the provider for new checkouts and payout beneficiary registration. Existing payments, refunds, payouts, webhook verification and manual verification are routed by the provider recorded on each financial record; changing the default does not rewrite historical records.

## Endpoints

- `POST /payments/initialize` — authenticated student checkout. The server derives the amount from an approved resource price or a server-configured Wisdom Points package. The client cannot submit an amount.
- `GET /payments/verify/:reference` — authenticated owner verification. The server calls the provider recorded on the transaction and checks reference, status, currency and exact amount before applying value.
- `POST /payments/webhooks/:provider` — public provider callback. Raw request bytes are signature-verified before parsing. Successful events are independently verified against the provider API before settlement.
- `POST /resources/:id/download` and `GET /resources/:id/file-url` — authenticated resource download and file access. Paid-resource access requires a persisted purchase record, except for the uploader and authorized staff.

### Request examples

Resource purchase:

```json
{ "purpose": "resource_purchase", "resourceId": "RESOURCE_UUID" }
```

Wisdom Points top-up:

```json
{ "purpose": "wisdom_points_topup", "packageId": "starter" }
```

The package identifier must exist in the server-side `PAYMENT_WISDOM_PACKAGES` JSON configuration. No default package prices are enabled because the business has not approved the package schedule.

## Environment

Set these in the backend hosting environment, not in Git:

- `PAYMENT_PROVIDER=paystack` or `flutterwave`
- `PAYSTACK_SECRET_KEY` — Paystack test key in staging; live key only after production approval.
- `PAYSTACK_WEBHOOK_SECRET` — Paystack webhook signing secret (`whsec_` mode). Legacy `x-paystack-signature` is also accepted using the secret key.
- `FLUTTERWAVE_SECRET_KEY` — Flutterwave test secret key in staging; live key only after production approval.
- `FLUTTERWAVE_WEBHOOK_SECRET` — the exact secret hash configured in Flutterwave Dashboard. Flutterwave sends it in `verif-hash`; comparison is constant-time.
- `PAYMENT_CALLBACK_URL` — HTTPS frontend route that receives the reference and calls the authenticated verification endpoint.
- `PAYMENT_WISDOM_PACKAGES` — business-approved JSON map, for example `{"starter":{"amountNaira":500,"points":40}}`. The example is illustrative, not an approved price.

Configure the selected provider's webhook URL as:

`https://YOUR_API_HOST/payments/webhooks/paystack` for Paystack, or `https://YOUR_API_HOST/payments/webhooks/flutterwave` for Flutterwave.

For Paystack, subscribe to `charge.success` and transfer/refund events required by the payout lifecycle. For Flutterwave, enable charge, refund and transfer webhooks and set the Dashboard secret hash to the exact `FLUTTERWAVE_WEBHOOK_SECRET` value. Flutterwave webhook events are re-verified through the provider API before settlement or payout state changes. Keep provider credentials in deployment secrets.

## Real staging verification

The repository includes `scripts/payment-staging-smoke.cjs`. It uses Node's native `fetch` to call the deployed API and the provider selected by the staging environment (`PAYMENT_PROVIDER`). It does not mock the API, database, payment provider, authentication, or storage.

Use a staging resource that is approved, verified, paid, and owned by a different lecturer account. Provision two active student accounts: one to purchase the resource and a second account that must remain unpaid. Do not use production accounts or live payment keys for this test.

First create a real checkout:

```bash
API_BASE_URL=https://YOUR_STAGING_API \
RESOURCE_ID=YOUR_PAID_RESOURCE_UUID \
PURCHASER_TOKEN=PURCHASER_STUDENT_JWT \
MODE=initialize node scripts/payment-staging-smoke.cjs
```

Open the returned hosted checkout URL and complete the payment with the selected provider's currently documented test payment details. The script prints the payment reference; it does not print credentials.

Then verify settlement and real resource access:

```bash
API_BASE_URL=https://YOUR_STAGING_API \
RESOURCE_ID=YOUR_PAID_RESOURCE_UUID \
PURCHASER_TOKEN=PURCHASER_STUDENT_JWT \
UNPAID_STUDENT_TOKEN=UNPAID_STUDENT_JWT \
PAYMENT_REFERENCE=REFERENCE_FROM_INITIALIZE \
MODE=verify node scripts/payment-staging-smoke.cjs
```

The second phase requires provider verification to return `success`, checks that the purchaser can record a download and obtain a signed file URL from the real storage integration, and checks that the unpaid student receives HTTP 403. A pending, failed, or mismatched payment must not be treated as success. Keep the test resource and accounts isolated from real learner data.

## Settlement guarantees and boundaries

- Checkout amounts are calculated server-side in NGN minor units (kobo).
- Provider webhooks are authenticated using the raw body; the modern timestamped signature is checked with a five-minute tolerance.
- A webhook does not itself grant value: the backend calls the recorded provider's verification endpoint and checks reference, status, amount and currency. Flutterwave verification resolves the merchant reference to its numeric transaction ID before calling the verify endpoint.
- A database row lock and transaction make successful settlement idempotent. Wisdom Points credit and ledger entry are committed together.
- Resource purchases create an ownership record and 70% lecturer / 30% platform gross-allocation entries. Provider fees and payout operations are not yet netted or executed; the entries are gross allocation records, not proof of payout.
- Paid-resource authorization is enforced at the resource download and file URL service paths. The staging smoke test must still be run against the deployed API, database, selected provider test account, and configured storage before production sign-off.
- Refunds, chargebacks, reconciliation and lecturer payouts are implemented through the provider contract. Multi-currency pricing remains out of scope; the current Sophis checkout and payout business rules are NGN-only.
- Do not enable live keys until the frontend callback, package pricing, webhook delivery, refund operations, and the real staging flow above have been tested end-to-end.


## Flutterwave staging setup

1. In Flutterwave test mode, create a test secret key and a random webhook secret hash. Store them as `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET` in the staging host. Do not commit either value.
2. Set `PAYMENT_PROVIDER=flutterwave` in staging and redeploy. This selects Flutterwave for new checkouts and new lecturer beneficiary registrations; existing records remain associated with their original provider.
3. Configure `https://YOUR_API_HOST/payments/webhooks/flutterwave` in the Flutterwave Dashboard and set the exact same secret hash. Enable charge, refund and transfer event notifications and retries.
4. Use the staging smoke script in `MODE=initialize`, complete a real Flutterwave test checkout, then run it in `MODE=verify`. The API must independently verify the transaction before it grants the resource entitlement.
5. Run read-only provider reconciliation as an administrator/moderator. Include `"provider":"flutterwave"` in the request body to reconcile Flutterwave records even when Paystack is the default, or use `"provider":"paystack"` for Paystack records. Payout reconciliation accepts the same provider selector.
6. For payout testing, verify a beneficiary in the active provider, create a lecturer payout request, approve it with an authorized operator, and confirm the provider transfer status and webhook. Do not infer successful payout from a queued transfer response.

Flutterwave hosted checkout, transaction verification, refunds, bank beneficiary verification, transfers and provider-specific read-only reconciliation are implemented in the adapter. Flutterwave amounts are submitted in naira and converted from the application's kobo minor units at the adapter boundary. Verified transactions, refunds and transfers are converted back to kobo before the shared ledger and payout services compare amounts. Flutterwave's webhook uses the Dashboard-configured `verif-hash` secret hash (not the Paystack HMAC signature format).

**Release gate:** CI tests validate adapter behavior and signature handling; they do not prove a real provider transaction. Do not enable live Flutterwave keys until the staging checkout, refund, beneficiary verification, transfer, webhook delivery and reconciliation have each been exercised against Flutterwave test mode.

## Checkout idempotency

Clients should send an `Idempotency-Key` header with each logical checkout attempt. Use the same key when retrying the same request after a network interruption; use a new key for a new purchase intent. Keys are scoped to the authenticated user, must be 8–128 characters, and may contain letters, numbers, dots, underscores, colons, and hyphens.

A replay with the same key and same server-priced purchase returns the original payment reference and checkout URL, including after a successful purchase. Reusing a key for a different purpose, resource, or package amount returns HTTP 409. The database enforces uniqueness per user. If provider initialization timed out after the provider may have accepted it, the pending intent is retained and replay does not create another provider checkout; verify/reconcile the original reference before taking corrective action.
