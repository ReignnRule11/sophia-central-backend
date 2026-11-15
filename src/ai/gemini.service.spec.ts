import { ServiceUnavailableException } from '@nestjs/common';
import { GeminiService } from './gemini.service';

describe('GeminiService', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  it('keeps storage disabled and records safe latency metrics on success', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'completed', output_text: 'A clear answer.' }),
    } as Response);

    const service = new GeminiService();
    await expect(service.generateText('Explain photosynthesis')).resolves.toBe('A clear answer.');

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.store).toBe(false);
    expect(request.model).toBe('gemini-3.8-flash');
    expect(console.info).toHaveBeenCalledWith(
      'Gemini generation completed',
      expect.objectContaining({
        model: 'gemini-3.8-flash',
        attempts: 1,
        historyTurns: 0,
        inputCharacters: expect.any(Number),
        outputCharacters: 'A clear answer.'.length,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('bounds resource context and conversation history before sending them', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'completed', output_text: 'Done.' }),
    } as Response);

    const service = new GeminiService();
    await service.generateText(
      'Latest question',
      'C'.repeat(10_000),
      [{ role: 'user', content: 'H'.repeat(10_000) }],
    );

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.input.length).toBeLessThanOrEqual(14_100);
    expect(request.input).toContain('Latest question');
  });

  it('returns a non-billable service error when Gemini fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ error: { message: 'Temporary provider error' } }),
    } as Response);

    const service = new GeminiService();
    await expect(service.generateText('Explain a topic')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
