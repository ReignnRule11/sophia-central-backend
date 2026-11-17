import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InitializePaymentInput, InitializedPayment, PaymentProvider, PaymentWebhookEvent, ProviderRefund, ProviderTransferRecord, VerifiedPayment } from './payment-provider.interface';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';
  private readonly baseUrl = 'https://api.paystack.co';
  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    const value = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!value) throw new ServiceUnavailableException('Paystack is not configured.');
    return value;
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secret()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException('Payment provider is temporarily unreachable.');
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.status) throw new ServiceUnavailableException(body?.message || 'Payment provider request failed.');
    return body.data;
  }

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    const data = await this.request('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    if (!data?.authorization_url || data.reference !== input.reference) {
      throw new ServiceUnavailableException('Payment provider returned an invalid checkout response.');
    }
    return { authorizationUrl: data.authorization_url, providerReference: data.reference, raw: data };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const data = await this.request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
    return {
      reference: String(data.reference || ''),
      status: String(data.status || ''),
      amountMinor: Number(data.amount),
      currency: String(data.currency || '').toUpperCase(),
      providerTransactionId: String(data.id || ''),
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      raw: data,
    };
  }

  async createRefund(input: { transactionReference: string; amountMinor: string; currency: string; reference: string; reason: string }): Promise<ProviderRefund> {
    const data = await this.request('/refund', {
      method: 'POST',
      body: JSON.stringify({
        transaction: input.transactionReference,
        amount: Number(input.amountMinor),
        currency: input.currency,
        reference: input.reference,
        merchant_note: input.reason,
      }),
    });
    if (!data?.id || String(data.transaction_reference || '') !== input.transactionReference && !data?.transaction) {
      throw new ServiceUnavailableException('Paystack returned an invalid refund response.');
    }
    return { id: String(data.id), status: String(data.status || 'pending'), amountMinor: Number(data.amount), currency: String(data.currency || input.currency).toUpperCase(), raw: data };
  }

  async verifyRefund(providerRefundId: string): Promise<ProviderRefund> {
    const data = await this.request(`/refund/${encodeURIComponent(providerRefundId)}`, { method: 'GET' });
    return { id: String(data.id), status: String(data.status || ''), amountMinor: Number(data.amount), currency: String(data.currency || '').toUpperCase(), raw: data };
  }

  async listTransactions(input: { from: string; to: string }): Promise<Array<{ reference: string; status: string; amount: number; currency: string; id?: number | string; [key: string]: unknown }>> {
    const results: Array<{ reference: string; status: string; amount: number; currency: string; id?: number | string; [key: string]: unknown }> = [];
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ from: input.from, to: input.to, perPage: '100', page: String(page) });
      const rows = await this.request(`/transaction?${query.toString()}`, { method: 'GET' });
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Paystack returned an invalid transaction list.');
      results.push(...rows);
      if (rows.length < 100) return results;
    }
    throw new ServiceUnavailableException('Paystack transaction reconciliation exceeded the 10,000-record safety limit.');
  }

  async listRefunds(input: { from: string; to: string }): Promise<Array<{ id: number | string; status: string; amount: number; currency: string; transaction?: number | string; [key: string]: unknown }>> {
    const results: Array<{ id: number | string; status: string; amount: number; currency: string; transaction?: number | string; [key: string]: unknown }> = [];
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ from: input.from, to: input.to, perPage: '100', page: String(page) });
      const rows = await this.request(`/refund?${query.toString()}`, { method: 'GET' });
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Paystack returned an invalid refund list.');
      results.push(...rows);
      if (rows.length < 100) return results;
    }
    throw new ServiceUnavailableException('Paystack refund reconciliation exceeded the 10,000-record safety limit.');
  }


  async listTransfers(input: { from: string; to: string }): Promise<ProviderTransferRecord[]> {
    const results: ProviderTransferRecord[] = [];
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ from: input.from, to: input.to, perPage: '100', page: String(page) });
      const rows = await this.request(`/transfer?${query.toString()}`, { method: 'GET' });
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Paystack returned an invalid transfer list.');
      results.push(...rows);
      if (rows.length < 100) return results;
    }
    throw new ServiceUnavailableException('Paystack transfer reconciliation exceeded the 10,000-record safety limit.');
  }


  async resolveBankAccount(accountNumber: string, bankCode: string) {
    const query = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
    const data = await this.request(`/bank/resolve?${query.toString()}`, { method: 'GET' });
    if (!data?.account_name || !data?.account_number) throw new ServiceUnavailableException('Paystack could not verify the bank account.');
    const banks = await this.request(`/bank?currency=NGN&perPage=100`, { method: 'GET' });
    const bank = Array.isArray(banks) ? banks.find((item: any) => String(item.code) === bankCode) : null;
    return { accountName: String(data.account_name), bankName: String(bank?.name || 'Bank'), accountNumber: String(data.account_number), bankCode };
  }

  async createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
    const data = await this.request('/transferrecipient', { method: 'POST', body: JSON.stringify({
      type: 'nuban', name: input.name, account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN',
    }) });
    if (!data?.recipient_code || !data?.details?.account_number) throw new ServiceUnavailableException('Paystack returned an invalid transfer recipient.');
    return { recipientCode: String(data.recipient_code), accountName: String(data.details.account_name || data.name || input.name), bankName: String(data.details.bank_name || 'Bank') };
  }

  async initiateTransfer(input: { amountMinor: string; recipientCode: string; reference: string; reason: string }) {
    const data = await this.request('/transfer', { method: 'POST', body: JSON.stringify({
      source: 'balance', amount: Number(input.amountMinor), recipient: input.recipientCode,
      reference: input.reference, reason: input.reason, currency: 'NGN',
    }) });
    if (String(data.reference || '') !== input.reference || Number(data.amount) !== Number(input.amountMinor)) {
      throw new ServiceUnavailableException('Paystack transfer response did not match the payout request.');
    }
    return { reference: input.reference, status: String(data.status || 'pending'), transferCode: data.transfer_code ? String(data.transfer_code) : null,
      amountMinor: Number(data.amount), currency: String(data.currency || 'NGN').toUpperCase(), raw: data };
  }

  async verifyTransfer(reference: string) {
    const data = await this.request(`/transfer/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
    if (String(data.reference || '') !== reference) throw new ServiceUnavailableException('Paystack transfer verification reference mismatch.');
    return { reference, status: String(data.status || ''), transferCode: data.transfer_code ? String(data.transfer_code) : null,
      amountMinor: Number(data.amount), currency: String(data.currency || '').toUpperCase(), raw: data };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent | null {
    const getHeader = (name: string) => {
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    const modern = getHeader('paystack-signature');
    const legacy = getHeader('x-paystack-signature');
    let valid = false;

    if (modern) {
      const webhookSecret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET');
      if (!webhookSecret) throw new UnauthorizedException('Paystack webhook signing secret is not configured.');
      const parts = modern.split(',');
      const timestamp = parts.find(part => part.startsWith('t='))?.slice(2);
      const signatures = parts.filter(part => part.startsWith('v1=')).map(part => part.slice(3).split(':').pop() || '');
      const seconds = Number(timestamp);
      if (!timestamp || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
        throw new UnauthorizedException('Expired or invalid Paystack webhook timestamp.');
      }
      const expected = createHmac('sha512', webhookSecret).update(timestamp + '.' ).update(rawBody).digest();
      valid = signatures.some(signature => {
        if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
        const supplied = Buffer.from(signature, 'hex');
        return supplied.length === expected.length && timingSafeEqual(expected, supplied);
      });
    } else if (legacy) {
      const expected = createHmac('sha512', this.secret()).update(rawBody).digest();
      if (/^[a-f0-9]{128}$/i.test(legacy)) {
        const supplied = Buffer.from(legacy, 'hex');
        valid = supplied.length === expected.length && timingSafeEqual(expected, supplied);
      }
    }
    if (!valid) throw new UnauthorizedException('Invalid Paystack webhook signature.');

    let event: any;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { throw new UnauthorizedException('Invalid webhook payload.'); }
    const data = event?.data || {};
    const reference = data.reference || data.transaction_reference || data.transaction?.reference;
    if (typeof reference !== 'string' || !reference) return null;
    return { reference, event: String(event?.event || ''), data };
  }
}
