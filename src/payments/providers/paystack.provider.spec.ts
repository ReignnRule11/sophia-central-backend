import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaystackProvider } from './paystack.provider';

describe('PaystackProvider webhook verification', () => {
  const secret = 'sk_test_example_secret';
  const webhookSecret = 'whsec_example_webhook_secret';
  let provider: PaystackProvider;

  beforeEach(() => {
    provider = new PaystackProvider({
      get: (key: string) => key === 'PAYSTACK_SECRET_KEY' ? secret : key === 'PAYSTACK_WEBHOOK_SECRET' ? webhookSecret : undefined,
    } as unknown as ConfigService);
  });

  it('accepts a valid legacy raw-body signature', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'ref-1' } }));
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    expect(provider.verifyWebhook(raw, { 'x-paystack-signature': signature })).toEqual({ reference: 'ref-1', event: 'charge.success' });
  });

  it('accepts a valid timestamped webhook signature', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'ref-2' } }));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha512', webhookSecret).update(timestamp + '.').update(raw).digest('hex');
    expect(provider.verifyWebhook(raw, { 'paystack-signature': `t=${timestamp},v1=whk_test:${signature}` })).toEqual({ reference: 'ref-2', event: 'charge.success' });
  });

  it('rejects an invalid signature', () => {
    const raw = Buffer.from('{"event":"charge.success","data":{"reference":"ref-3"}}');
    expect(() => provider.verifyWebhook(raw, { 'x-paystack-signature': '0'.repeat(128) })).toThrow(UnauthorizedException);
  });

  it('rejects a stale timestamped signature', () => {
    const raw = Buffer.from('{"event":"charge.success","data":{"reference":"ref-4"}}');
    const timestamp = String(Math.floor(Date.now() / 1000) - 600);
    const signature = createHmac('sha512', webhookSecret).update(timestamp + '.').update(raw).digest('hex');
    expect(() => provider.verifyWebhook(raw, { 'paystack-signature': `t=${timestamp},v1=whk_test:${signature}` })).toThrow(UnauthorizedException);
  });
});
