import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InitializePaymentInput, InitializedPayment, PaymentProvider, VerifiedPayment } from './payment-provider.interface';

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

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): { reference: string; event: string } | null {
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
    const reference = event?.data?.reference;
    if (typeof reference !== 'string' || !reference) return null;
    return { reference, event: String(event?.event || '') };
  }
}
