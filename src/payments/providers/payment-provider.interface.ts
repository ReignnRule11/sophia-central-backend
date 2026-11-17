export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface InitializePaymentInput {
  email: string; amountMinor: string; currency: string; reference: string; callbackUrl: string; metadata: Record<string, string>;
}
export interface InitializedPayment { authorizationUrl: string; providerReference: string; raw: Record<string, unknown>; }
export interface VerifiedPayment {
  reference: string; status: string; amountMinor: number; currency: string; providerTransactionId: string; paidAt?: Date; raw: Record<string, unknown>;
}
export interface ProviderRefund {
  id: string; status: string; amountMinor: number; currency: string; raw: Record<string, unknown>;
}
export interface PaymentWebhookEvent {
  reference: string; event: string; data?: Record<string, any>;
}
export interface ProviderTransactionRecord {
  reference: string; status: string; amount: number; currency: string; id?: number | string; [key: string]: unknown;
}
export interface ProviderRefundRecord {
  id: number | string; status: string; amount: number; currency: string; transaction?: number | string; [key: string]: unknown;
}
export interface ProviderBankAccount { accountName: string; bankName: string; accountNumber: string; bankCode: string; }
export interface ProviderTransfer { reference: string; status: string; transferCode: string | null; amountMinor: number; currency: string; raw: Record<string, unknown>; }
export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitializePaymentInput): Promise<InitializedPayment>;
  verify(reference: string): Promise<VerifiedPayment>;
  createRefund(input: { transactionReference: string; amountMinor: string; currency: string; reference: string; reason: string }): Promise<ProviderRefund>;
  verifyRefund(providerRefundId: string): Promise<ProviderRefund>;
  listTransactions(input: { from: string; to: string }): Promise<ProviderTransactionRecord[]>;
  listRefunds(input: { from: string; to: string }): Promise<ProviderRefundRecord[]>;
  resolveBankAccount(accountNumber: string, bankCode: string): Promise<ProviderBankAccount>;
  createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }): Promise<{ recipientCode: string; accountName: string; bankName: string }>;
  initiateTransfer(input: { amountMinor: string; recipientCode: string; reference: string; reason: string }): Promise<ProviderTransfer>;
  verifyTransfer(reference: string): Promise<ProviderTransfer>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent | null;
}
