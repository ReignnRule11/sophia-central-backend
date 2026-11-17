# Lecturer Payouts — Operations

## Scope

This release adds a Paystack-backed Nigerian bank payout workflow for lecturer earnings. It is not a wallet or a cash advance: only earned lecturer ledger allocations are eligible.

## Lecturer endpoints

- `POST /payments/payouts/beneficiary` — body: `{ "accountNumber": "0123456789", "bankCode": "058" }`. The server resolves the account with Paystack and creates a transfer recipient. Only recipient code, account name, bank name and last four digits are stored locally.
- `GET /payments/payouts/balance` — available NGN earnings in kobo.
- `POST /payments/payouts` — body: `{ "amountMinor": "500000" }`; creates a payout request but does not send money.

## Operator endpoints

- `GET /payments/payouts/requests` — latest 100 requests.
- `POST /payments/payouts/:id/approve` — administrator/moderator approval and Paystack transfer initiation.
- `GET /payments/payouts/verify/:reference` — verify an in-flight transfer against Paystack.

## Financial controls

- Payout requests are reserved immediately and remain reserved while requested, processing, pending or OTP.
- Approval is separate from lecturer request; the lecturer cannot approve their own payout.
- The lecturer row is locked during balance calculation and payout request creation to serialize competing requests.
- Available balance starts from successful lecturer-share ledger entries, subtracts lecturer refund adjustments, and conservatively holds the full lecturer allocation for any payment with an open/under-review dispute.
- Successful payouts remain deducted; failed/reversed payouts release the reservation.
- A provider timeout is an uncertain outcome. The payout remains reserved; do not retry until the original reference is verified.
- Only NGN/NUBAN bank accounts are enabled in this release.
- Raw account numbers are not persisted by Sophis Central.

## Deployment

1. Configure `PAYSTACK_SECRET_KEY` with a Paystack test secret in staging.
2. Run the database migration before deploying the API.
3. Configure Paystack Transfers in the dashboard and ensure the account has test-mode transfer capability.
4. Verify bank resolution, beneficiary creation, payout request, approval, and transfer verification with a test lecturer.
5. Do not use live funds until a real staging test and operational review pass.

## Important limitation

This release uses authenticated Paystack transfer verification through the operator endpoint. A later hardening step should add transfer webhook lifecycle handling and automated payout reconciliation before enabling unattended payout operations.
