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
    expect(provider.verifyWebhook(raw, { 'x-paystack-signature': signature })).toEqual({ reference: 'ref-1', event: 'charge.success', data: { reference: 'ref-1' } });
  });

  it('accepts a valid timestamped webhook signature', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'ref-2' } }));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha512', webhookSecret).update(timestamp + '.').update(raw).digest('hex');
    expect(provider.verifyWebhook(raw, { 'paystack-signature': `t=${timestamp},v1=whk_test:${signature}` })).toEqual({ reference: 'ref-2', event: 'charge.success', data: { reference: 'ref-2' } });
  });

  it('extracts transaction references from refund and dispute events', () => {
    const refund = Buffer.from(JSON.stringify({ event: 'refund.processed', data: { transaction_reference: 'payment-ref', id: 44 } }));
    const refundSignature = createHmac('sha512', secret).update(refund).digest('hex');
    expect(provider.verifyWebhook(refund, { 'x-paystack-signature': refundSignature })).toEqual({
      reference: 'payment-ref', event: 'refund.processed', data: { transaction_reference: 'payment-ref', id: 44 },
    });
    const dispute = Buffer.from(JSON.stringify({ event: 'charge.dispute.create', data: { transaction: { reference: 'payment-ref' }, id: 9 } }));
    const disputeSignature = createHmac('sha512', secret).update(dispute).digest('hex');
    expect(provider.verifyWebhook(dispute, { 'x-paystack-signature': disputeSignature })).toEqual({
      reference: 'payment-ref', event: 'charge.dispute.create', data: { transaction: { reference: 'payment-ref' }, id: 9 },
    });
  });

  it('creates and verifies a refund using the provider API', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: true, data: { id: 123, status: 'pending', amount: 2500, currency: 'NGN', transaction: 987 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: true, data: { id: 123, status: 'processed', amount: 2500, currency: 'NGN' } }), { status: 200 }));
    const created = await provider.createRefund({ transactionReference: 'pay-ref', amountMinor: '2500', currency: 'NGN', reference: 'refund-ref-123', reason: 'Duplicate purchase' });
    expect(created).toMatchObject({ id: '123', status: 'pending', amountMinor: 2500, currency: 'NGN' });
    const verified = await provider.verifyRefund('123');
    expect(verified.status).toBe('processed');
    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://api.paystack.co/refund', expect.objectContaining({ method: 'POST' }));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://api.paystack.co/refund/123', expect.objectContaining({ method: 'GET' }));
    fetchSpy.mockRestore();
  });

  it('lists transactions and refunds using bounded pagination', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: true, data: [{ reference: 'tx-1', status: 'success', amount: 5000, currency: 'NGN' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: true, data: [{ id: 91, status: 'processed', amount: 5000, currency: 'NGN' }] }), { status: 200 }));
    const from = '2026-11-17T00:00:00.000Z';
    const to = '2026-11-18T00:00:00.000Z';
    await expect(provider.listTransactions({ from, to })).resolves.toHaveLength(1);
    await expect(provider.listRefunds({ from, to })).resolves.toHaveLength(1);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('/transaction?'), expect.any(Object));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, expect.stringContaining('/refund?'), expect.any(Object));
    fetchSpy.mockRestore();
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
