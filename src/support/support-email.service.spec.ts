import { SupportEmailService } from './support-email.service';

describe('SupportEmailService', () => {
  const config = {
    get: jest.fn((key: string) => ({
      RESEND_API_KEY: 'test-key',
      SUPPORT_EMAIL: 'support@example.test',
      SUPPORT_FROM_EMAIL: 'Sophis Central Support <support@example.test>',
      FRONTEND_URL: 'https://sophiscentral.vercel.app',
    } as Record<string, string>)[key]),
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: SupportEmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new SupportEmailService(config as any);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('reports whether outbound support email is configured without exposing credentials', () => {
    expect(service.getConfigurationStatus()).toEqual({
      configured: true,
      provider: 'resend',
      inboundReplySync: false,
    });
  });

  it('sends a support-team alert and an acknowledgement to the requester', async () => {
    const request = {
      id: 'ticket-1',
      ticketNumber: 'SUP-2026-000001',
      subject: 'Cannot open a resource',
      category: 'resources',
      description: 'The resource reader shows an error.',
    } as any;
    const user = {
      email: 'student@example.test',
      firstName: 'Ada',
      lastName: 'Student',
    } as any;

    await expect(service.notifyNewRequest(request, user)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstMessage = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondMessage = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstMessage.to).toEqual(['support@example.test']);
    expect(firstMessage.reply_to).toBe('student@example.test');
    expect(secondMessage.to).toEqual(['student@example.test']);
    expect(secondMessage.reply_to).toBe('support@example.test');
  });

  it('sends a guest verification link and ticket-numbered correspondence after verification', async () => {
    const request = {
      ticketNumber: 'SUP-2026-000042',
      senderName: 'Visitor',
      senderEmail: 'visitor@example.test',
      senderInstitution: 'Example University',
      subject: 'Cannot access a resource',
      category: 'resources',
      description: 'The reader does not load.',
      links: [],
    } as any;

    await service.sendGuestVerification(request, 'a'.repeat(64));
    const verification = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(verification.to).toEqual(['visitor@example.test']);
    expect(verification.subject).toContain(request.ticketNumber);
    expect(verification.text).toContain('verifySupport=');

    fetchMock.mockClear();
    await service.notifyNewGuestRequest(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const supportMessage = JSON.parse(fetchMock.mock.calls[0][1].body);
    const requesterMessage = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(supportMessage.to).toEqual(['support@example.test']);
    expect(supportMessage.subject).toContain(request.ticketNumber);
    expect(supportMessage.text).toContain('Example University');
    expect(requesterMessage.to).toEqual(['visitor@example.test']);
    expect(requesterMessage.subject).toContain(request.ticketNumber);

    fetchMock.mockClear();
    request.resolutionMessage = 'We have resolved the access issue.';
    await service.sendGuestResolution(request);
    const response = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(response.to).toEqual(['visitor@example.test']);
    expect(response.subject).toContain(request.ticketNumber);
    expect(response.text).toContain(request.ticketNumber);
  });

  it('does not send when the dedicated mailbox configuration is absent', async () => {
    config.get.mockImplementation((key: string) => key === 'RESEND_API_KEY' ? 'test-key' : '');
    expect(service.isConfigured()).toBe(false);
    await expect(service.notifyNewRequest({} as any, {} as any)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
