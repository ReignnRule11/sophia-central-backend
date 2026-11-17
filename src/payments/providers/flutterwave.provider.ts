import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import {
  InitializePaymentInput, InitializedPayment, PaymentProvider, PaymentWebhookEvent,
  ProviderRefund, ProviderRefundRecord, ProviderTransactionRecord, ProviderTransfer,
  ProviderTransferRecord, VerifiedPayment,
} from './payment-provider.interface';

@Injectable()
export class FlutterwaveProvider implements PaymentProvider {
  readonly name = 'flutterwave';
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    const value = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    if (!value) throw new ServiceUnavailableException('Flutterwave is not configured.');
    return value;
  }

  private async request(path: string, init: RequestInit = {}, envelope = false): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secret()}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException('Flutterwave is temporarily unreachable.');
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.status !== 'success') {
      throw new ServiceUnavailableException(body?.message || 'Flutterwave request failed.');
    }
    return envelope ? body : body.data;
  }

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    const data = await this.request('/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(input.amountMinor) / 100,
        currency: input.currency,
        tx_ref: input.reference,
        redirect_url: input.callbackUrl,
        customer: { email: input.email },
        meta: input.metadata,
      }),
    });
    if (typeof data?.link !== 'string' || !data.link.startsWith('https://checkout.flutterwave.com/')) {
      throw new ServiceUnavailableException('Flutterwave returned an invalid hosted checkout URL.');
    }
    return { authorizationUrl: data.link, providerReference: input.reference, raw: data };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const query = new URLSearchParams({ from: '2010-01-01', to: new Date().toISOString().slice(0, 10), tx_ref: reference, page: '1' });
    const rows = await this.request(`/transactions?${query.toString()}`);
    if (!Array.isArray(rows)) throw new ServiceUnavailableException('Flutterwave returned an invalid transaction lookup.');
    const row = rows.find((item: any) => String(item.tx_ref || '') === reference);
    if (!row?.id) throw new ServiceUnavailableException('Flutterwave transaction was not found for this reference.');
    const data = await this.request(`/transactions/${encodeURIComponent(String(row.id))}/verify`);
    if (String(data.tx_ref || '') !== reference) throw new ServiceUnavailableException('Flutterwave verification reference mismatch.');
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) {
      throw new ServiceUnavailableException('Flutterwave returned an invalid transaction amount.');
    }
    const status = String(data.status || '').toLowerCase();
    return {
      reference: String(data.tx_ref),
      status: status === 'successful' ? 'success' : status,
      amountMinor: Math.round(amount * 100),
      currency: String(data.currency || '').toUpperCase(),
      providerTransactionId: String(data.id),
      paidAt: data.created_at ? new Date(data.created_at) : undefined,
      raw: data,
    };
  }

  async createRefund(input: { transactionReference: string; amountMinor: string; currency: string; reference: string; reason: string }): Promise<ProviderRefund> {
    if (!/^\d+$/.test(input.transactionReference)) {
      throw new ServiceUnavailableException('Flutterwave refunds require the verified numeric provider transaction ID.');
    }
    const data = await this.request(`/transactions/${encodeURIComponent(input.transactionReference)}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(input.amountMinor) / 100, comments: input.reason }),
    });
    const amountMinor = Math.round(Number(data.amount_refunded) * 100);
    if (!data?.id || !Number.isSafeInteger(amountMinor) || amountMinor !== Number(input.amountMinor)) {
      throw new ServiceUnavailableException('Flutterwave returned a refund response that does not match the request.');
    }
    return { id: String(data.id), status: this.refundStatus(data.status), amountMinor, currency: input.currency, raw: data };
  }

  async verifyRefund(providerRefundId: string): Promise<ProviderRefund> {
    const data = await this.request(`/refunds/${encodeURIComponent(providerRefundId)}`);
    const amountMinor = Math.round(Number(data.amount_refunded) * 100);
    if (!data?.id || !Number.isSafeInteger(amountMinor)) throw new ServiceUnavailableException('Flutterwave returned an invalid refund record.');
    const original = data.transaction_id ? await this.request(`/transactions/${encodeURIComponent(String(data.transaction_id))}/verify`) : null;
    return { id: String(data.id), status: this.refundStatus(data.status), amountMinor,
      currency: String(original?.currency || 'NGN').toUpperCase(), raw: data };
  }

  private refundStatus(status: unknown): string {
    const value = String(status || '').toLowerCase();
    if (['completed', 'successful', 'succeeded', 'processed'].includes(value)) return 'processed';
    if (['failed', 'cancelled'].includes(value)) return 'failed';
    if (value === 'requires_action') return 'needs-attention';
    if (['processing', 'pending', 'new', 'pending-bank-transfer', 'pending-mpgs'].includes(value)) return 'processing';
    return value;
  }

  async listTransactions(input: { from: string; to: string }): Promise<ProviderTransactionRecord[]> {
    const results: ProviderTransactionRecord[] = [];
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ from: input.from.slice(0, 10), to: input.to.slice(0, 10), page: String(page) });
      const body = await this.request(`/transactions?${query.toString()}`, {}, true);
      const rows = body?.data;
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Flutterwave returned an invalid transaction list.');
      for (const row of rows) results.push({
        reference: String(row.tx_ref || ''), status: String(row.status || '').toLowerCase() === 'successful' ? 'success' : String(row.status || '').toLowerCase(),
        amount: Math.round(Number(row.amount) * 100), currency: String(row.currency || '').toUpperCase(), id: row.id,
      });
      const pages = Number(body?.meta?.page_info?.total_pages || 0);
      if (!pages || page >= pages || rows.length === 0) return results;
    }
    throw new ServiceUnavailableException('Flutterwave transaction reconciliation exceeded the 10,000-record safety limit.');
  }

  async listRefunds(input: { from: string; to: string }): Promise<ProviderRefundRecord[]> {
    const results: ProviderRefundRecord[] = [];
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ from: input.from.slice(0, 10), to: input.to.slice(0, 10), page: String(page) });
      const body = await this.request(`/refunds?${query.toString()}`, {}, true);
      const rows = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Flutterwave returned an invalid refund list.');
      for (const row of rows) results.push({
        id: String(row.id), status: this.refundStatus(row.status),
        amount: Math.round(Number(row.amount_refunded ?? row.amount) * 100),
        currency: String(row.currency || 'NGN').toUpperCase(), transaction: row.transaction_id ?? row.tx_id,
      });
      const pages = Number(body?.meta?.page_info?.total_pages || 0);
      if (!pages || page >= pages || rows.length === 0) return results;
    }
    throw new ServiceUnavailableException('Flutterwave refund reconciliation exceeded the 10,000-record safety limit.');
  }

  async listTransfers(input: { from: string; to: string }): Promise<ProviderTransferRecord[]> {
    const results: ProviderTransferRecord[] = [];
    for (let page = 1; page <= 100; page++) {
      const query = new URLSearchParams({ from: input.from.slice(0, 10), to: input.to.slice(0, 10), page: String(page) });
      const body = await this.request(`/transfers?${query.toString()}`, {}, true);
      const rows = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(rows)) throw new ServiceUnavailableException('Flutterwave returned an invalid transfer list.');
      results.push(...rows.map((row: any) => ({ reference: String(row.reference || ''), status: String(row.status || '').toLowerCase(),
        amount: Math.round(Number(row.amount) * 100), currency: String(row.currency || '').toUpperCase() })));
      const pages = Number(body?.meta?.page_info?.total_pages || 0);
      if (!pages || page >= pages || rows.length === 0) return results;
    }
    throw new ServiceUnavailableException('Flutterwave transfer reconciliation exceeded the 10,000-record safety limit.');
  }

  async resolveBankAccount(accountNumber: string, bankCode: string) {
    const data = await this.request('/accounts/resolve', { method: 'POST', body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }) });
    if (!data?.account_name || !data?.account_number) throw new ServiceUnavailableException('Flutterwave could not verify the bank account.');
    const banks = await this.request('/banks/NG');
    const bank = Array.isArray(banks) ? banks.find((item: any) => String(item.code) === bankCode) : null;
    return { accountName: String(data.account_name), bankName: String(bank?.name || 'Verified bank'), accountNumber: String(data.account_number), bankCode };
  }

  async createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
    const data = await this.request('/beneficiaries', { method: 'POST', body: JSON.stringify({
      account_bank: input.bankCode, account_number: input.accountNumber, beneficiary_name: input.name, currency: 'NGN',
    }) });
    if (!data?.id || String(data.account_number || '') !== input.accountNumber || String(data.bank_code || '') !== input.bankCode) {
      throw new ServiceUnavailableException('Flutterwave returned an invalid beneficiary record.');
    }
    return { recipientCode: String(data.id), accountName: String(data.full_name || input.name), bankName: String(data.bank_name || 'Bank') };
  }

  async initiateTransfer(input: { amountMinor: string; recipientCode: string; reference: string; reason: string }): Promise<ProviderTransfer> {
    const beneficiary = await this.request(`/beneficiaries/${encodeURIComponent(input.recipientCode)}`);
    if (!beneficiary?.account_number || !beneficiary?.bank_code) throw new ServiceUnavailableException('Flutterwave beneficiary could not be retrieved.');
    const data = await this.request('/transfers', { method: 'POST', body: JSON.stringify({
      beneficiary: Number(input.recipientCode), account_bank: String(beneficiary.bank_code), account_number: String(beneficiary.account_number),
      beneficiary_name: String(beneficiary.full_name || ''), amount: Number(input.amountMinor) / 100, currency: 'NGN',
      reference: input.reference, narration: input.reason,
    }) });
    const amountMinor = Math.round(Number(data.amount) * 100);
    if (String(data.reference || '') !== input.reference || amountMinor !== Number(input.amountMinor)) {
      throw new ServiceUnavailableException('Flutterwave transfer response did not match the payout request.');
    }
    return { reference: input.reference, status: String(data.status || 'NEW').toLowerCase(),
      transferCode: data.id ? String(data.id) : null, amountMinor, currency: String(data.currency || 'NGN').toUpperCase(), raw: data };
  }

  async verifyTransfer(reference: string): Promise<ProviderTransfer> {
    const query = new URLSearchParams({ reference, page: '1' });
    const rows = await this.request(`/transfers?${query.toString()}`);
    const row = (Array.isArray(rows) ? rows : rows?.data)?.find((item: any) => String(item.reference || '') === reference);
    if (!row?.id) throw new ServiceUnavailableException('Flutterwave transfer was not found for this reference.');
    const data = await this.request(`/transfers/${encodeURIComponent(String(row.id))}`);
    if (String(data.reference || '') !== reference) throw new ServiceUnavailableException('Flutterwave transfer reference mismatch.');
    return { reference, status: String(data.status || '').toLowerCase(), transferCode: String(data.id),
      amountMinor: Math.round(Number(data.amount) * 100), currency: String(data.currency || '').toUpperCase(), raw: data };
  }

  verifyWebhook(_rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentWebhookEvent | null {
    const configured = this.config.get<string>('FLUTTERWAVE_WEBHOOK_SECRET');
    const value = headers['verif-hash'] ?? headers['Verif-Hash'];
    const supplied = Array.isArray(value) ? value[0] : value;
    if (!configured) throw new UnauthorizedException('Flutterwave webhook secret hash is not configured.');
    if (typeof supplied !== 'string') throw new UnauthorizedException('Flutterwave webhook signature is missing.');
    const expectedBuffer = Buffer.from(configured);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new UnauthorizedException('Invalid Flutterwave webhook signature.');
    }
    let payload: any;
    try { payload = JSON.parse(_rawBody.toString('utf8')); } catch { throw new UnauthorizedException('Invalid Flutterwave webhook payload.'); }
    const data = payload?.data || payload?.transfer || {};
    const reference = data.tx_ref || data.reference || data.refund_reference || (String(payload?.event || '').startsWith('refund.') && data.id ? String(data.id) : null);
    if (typeof reference !== 'string' || !reference) return null;
    return { reference, event: String(payload?.event || payload?.['event.type'] || ''), data };
  }
}
