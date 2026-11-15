import { ServiceUnavailableException } from '@nestjs/common';
import { GroqService } from './groq.service';

describe('GroqService', () => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.GROQ_MODEL;
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalModel;
  });

  it('uses GPT-OSS 120B with low reasoning and returns the completion', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: 'A clear answer.' } }],
      }),
    } as Response);

    const service = new GroqService();
    await expect(service.generateText('Explain photosynthesis')).resolves.toBe('A clear answer.');

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(request.model).toBe('openai/gpt-oss-120b');
    expect(request.reasoning_effort).toBe('low');
    expect(request.max_completion_tokens).toBe(2_048);
    expect(request.messages[1].content).toContain('Explain photosynthesis');
  });

  it('uses the configured model when GROQ_MODEL is set', async () => {
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'Done.' } }] }),
    } as Response);

    await new GroqService().generateText('Question');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('openai/gpt-oss-120b');
  });

  it('does not retry rate limits and returns a service-unavailable error for fallback', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
    } as Response);

    await expect(new GroqService().generateText('Question')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 and succeeds on the next attempt', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'Unavailable' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'Recovered.' } }] }),
      } as Response);

    const generation = new GroqService().generateText('Question');
    const result = expect(generation).resolves.toBe('Recovered.');
    await jest.advanceTimersByTimeAsync(1_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
