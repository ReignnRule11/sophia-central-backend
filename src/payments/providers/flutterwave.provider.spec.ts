import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlutterwaveProvider } from './flutterwave.provider';

describe('FlutterwaveProvider', () => {
  const secret = 'FLWSECK_TEST-example';
  const webhookSecret = 'random-flutterwave-secret-hash';
  let provider: FlutterwaveProvider;

  beforeEach(() => {
    provider = new FlutterwaveProvider({
      get: (key: string) => key === 'FLUTTERWAVE_SECRET_KEY' ? secret : key === 'FLUTTERWAVE_WEBHOOK_SECRET' ? webhookSecret : undefined,
    } as unknown as ConfigService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates a hosted checkout using naira units and the merchant reference', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'success', data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/test-link' },
    }), { status: 200 }));
    const result = await provider.initialize({
      email: 'student@example.com', amountMinor: '125000', currency: 'NGN', reference: 'SOPHIS-123',
      callbackUrl: 'https://app.example.com/payment/callback', metadata: { paymentId: 'payment-id' },
    });
    expect(result.authorizationUrl).toContain('checkout.flutterwave.com');
    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ amount: 1250, currency: 'NGN', tx_ref: 'SOPHIS-123' });
  });

  it('verifies the provider transaction ID and converts naira to kobo', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data: [{ id: 987, tx_ref: 'SOPHIS-123' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data: {
        id: 987, tx_ref: 'SOPHIS-123', status: 'successful', amount: 1250, currency: 'NGN', created_at: '2026-11-17T12:00:00.000Z',
      } }), { status: 200 }));
    await expect(provider.verify('SOPHIS-123')).resolves.toMatchObject({
      reference: 'SOPHIS-123', status: 'success', amountMinor: 125000, currency: 'NGN', providerTransactionId: '987',
    });
  });

  it('uses Flutterwave numeric transaction IDs for partial refunds', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'success', data: { id: 456, amount_refunded: 250, status: 'processing' },
    }), { status: 200 }));
    await expect(provider.createRefund({
      transactionReference: '987', amountMinor: '25000', currency: 'NGN', reference: 'REF-1', reason: 'Duplicate purchase',
    })).resolves.toMatchObject({ id: '456', amountMinor: 25000, currency: 'NGN', status: 'processing' });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.flutterwave.com/v3/transactions/987/refund');
  });

  it('authenticates Flutterwave webhooks using the configured verif-hash', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'charge.completed', data: { id: 987, tx_ref: 'SOPHIS-123' } }));
    expect(provider.verifyWebhook(raw, { 'verif-hash': webhookSecret })).toMatchObject({
      reference: 'SOPHIS-123', event: 'charge.completed',
    });
  });

  it('rejects missing or invalid webhook hashes', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'charge.completed', data: { tx_ref: 'SOPHIS-123' } }));
    expect(() => provider.verifyWebhook(raw, {})).toThrow(UnauthorizedException);
    expect(() => provider.verifyWebhook(raw, { 'verif-hash': 'wrong-secret' })).toThrow(UnauthorizedException);
  });
});
