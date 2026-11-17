# Sophis Central payments setup

## Architecture

The application uses a provider-neutral `PaymentProvider` contract. `PAYMENT_PROVIDER=paystack` selects the first adapter. New providers (for example Flutterwave or M-Pesa) should implement the same initialize, verify and signed-webhook contract; business logic and database records must not import provider-specific SDKs.

## Endpoints

- `POST /payments/initialize` — authenticated student checkout. The server derives the amount from an approved resource price or a server-configured Wisdom Points package. The client cannot submit an amount.
- `GET /payments/verify/:reference` — authenticated owner verification. The server calls the configured provider and checks reference, status, currency and exact amount before applying value.
- `POST /payments/webhooks/:provider` — public provider callback. Raw request bytes are signature-verified before parsing. Successful events are independently verified against the provider API before settlement.

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

## Settlement guarantees and boundaries

- Checkout amounts are calculated server-side in NGN minor units (kobo).
- Provider webhooks are authenticated using the raw body; the modern timestamped signature is checked with a five-minute tolerance.
- A webhook does not itself grant value: the backend calls Paystack's verify endpoint and checks reference, status, amount and currency.
- A database row lock and transaction make successful settlement idempotent. Wisdom Points credit and ledger entry are committed together.
- Resource purchases create an ownership record and immutable 70% lecturer / 30% platform gross-allocation entries. Provider fees and payout operations are not yet netted or executed; the entries are gross allocation records, not proof of payout.
- Payment status and ownership are not yet wired into every resource download/read route. That access-control integration must be completed before paid materials are exposed in production.
- Refunds, chargebacks, automated reconciliation, payout bank-account verification, multi-currency pricing and a second provider adapter remain separate follow-up work.
- Do not enable live keys until the frontend callback, resource access checks, package pricing, webhook delivery and refund operations have been tested end-to-end.
