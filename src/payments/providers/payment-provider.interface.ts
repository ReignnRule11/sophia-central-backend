export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface InitializePaymentInput {
  email: string;
  amountMinor: string;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}
export interface InitializedPayment {
  authorizationUrl: string;
  providerReference: string;
  raw: Record<string, unknown>;
}
export interface VerifiedPayment {
  reference: string;
  status: string;
  amountMinor: number;
  currency: string;
  providerTransactionId: string;
  paidAt?: Date;
  raw: Record<string, unknown>;
}
export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitializePaymentInput): Promise<InitializedPayment>;
  verify(reference: string): Promise<VerifiedPayment>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): { reference: string; event: string } | null;
}
