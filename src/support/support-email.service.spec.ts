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

  it('does not send when the dedicated mailbox configuration is absent', async () => {
    config.get.mockImplementation((key: string) => key === 'RESEND_API_KEY' ? 'test-key' : '');
    expect(service.isConfigured()).toBe(false);
    await expect(service.notifyNewRequest({} as any, {} as any)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
