# Sophis Central payments setup

## Architecture

The application uses a provider-neutral `PaymentProvider` contract. `PAYMENT_PROVIDER=paystack` selects the first adapter. New providers (for example Flutterwave or M-Pesa) should implement the same initialize, verify and signed-webhook contract; business logic and database records must not import provider-specific SDKs.

## Endpoints

- `POST /payments/initialize` — authenticated student checkout. The server derives the amount from an approved resource price or a server-configured Wisdom Points package. The client cannot submit an amount.
- `GET /payments/verify/:reference` — authenticated owner verification. The server calls the configured provider and checks reference, status, currency and exact amount before applying value.
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

- `PAYMENT_PROVIDER=paystack`
- `PAYSTACK_SECRET_KEY` — Paystack test key in staging; live key only after production approval.
- `PAYSTACK_WEBHOOK_SECRET` — Paystack webhook signing secret (`whsec_` mode). Legacy `x-paystack-signature` is also accepted using the secret key.
- `PAYMENT_CALLBACK_URL` — HTTPS frontend route that receives the reference and calls the authenticated verification endpoint.
- `PAYMENT_WISDOM_PACKAGES` — business-approved JSON map, for example `{"starter":{"amountNaira":500,"points":40}}`. The example is illustrative, not an approved price.

Configure Paystack's webhook URL as:

`https://YOUR_API_HOST/payments/webhooks/paystack`

Subscribe to `charge.success`. Keep provider credentials in deployment secrets.

## Real staging verification

The repository includes `scripts/payment-staging-smoke.cjs`. It uses Node's native `fetch` to call the deployed API and configured Paystack test environment. It does not mock the API, database, payment provider, authentication, or storage.

Use a staging resource that is approved, verified, paid, and owned by a different lecturer account. Provision two active student accounts: one to purchase the resource and a second account that must remain unpaid. Do not use production accounts or live payment keys for this test.

First create a real checkout:

```bash
API_BASE_URL=https://YOUR_STAGING_API \
RESOURCE_ID=YOUR_PAID_RESOURCE_UUID \
PURCHASER_TOKEN=PURCHASER_STUDENT_JWT \
MODE=initialize node scripts/payment-staging-smoke.cjs
```

Open the returned Paystack test checkout URL and complete the payment with Paystack's currently documented test payment details. The script prints the payment reference; it does not print credentials.

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
- A webhook does not itself grant value: the backend calls Paystack's verify endpoint and checks reference, status, amount and currency.
- A database row lock and transaction make successful settlement idempotent. Wisdom Points credit and ledger entry are committed together.
- Resource purchases create an ownership record and 70% lecturer / 30% platform gross-allocation entries. Provider fees and payout operations are not yet netted or executed; the entries are gross allocation records, not proof of payout.
- Paid-resource authorization is enforced at the resource download and file URL service paths. The staging smoke test must still be run against the deployed API, database, Paystack test account, and configured storage before production sign-off.
- Refunds, chargebacks, automated reconciliation, payout bank-account verification, multi-currency pricing and a second provider adapter remain separate follow-up work.
- Do not enable live keys until the frontend callback, package pricing, webhook delivery, refund operations, and the real staging flow above have been tested end-to-end.
