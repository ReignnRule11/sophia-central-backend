import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { GroqService } from './groq.service';
import { GeminiService } from './gemini.service';

describe('AiProviderService', () => {
  const groq = { generateText: jest.fn() } as unknown as GroqService;
  const gemini = { generateText: jest.fn() } as unknown as GeminiService;
  let service: AiProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiProviderService(groq, gemini);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses Groq as the primary provider without calling Gemini on success', async () => {
    (groq.generateText as jest.Mock).mockResolvedValue('Groq answer');

    await expect(service.generateText('Question')).resolves.toBe('Groq answer');
    expect(gemini.generateText).not.toHaveBeenCalled();
  });

  it('falls back to Gemini when Groq fails', async () => {
    (groq.generateText as jest.Mock).mockRejectedValue(new ServiceUnavailableException());
    (gemini.generateText as jest.Mock).mockResolvedValue('Gemini fallback answer');

    await expect(service.generateText('Question')).resolves.toBe('Gemini fallback answer');
    expect(gemini.generateText).toHaveBeenCalledWith('Question', undefined, []);
  });

  it('returns a non-billable service error when both providers fail', async () => {
    (groq.generateText as jest.Mock).mockRejectedValue(new ServiceUnavailableException());
    (gemini.generateText as jest.Mock).mockRejectedValue(new ServiceUnavailableException());

    await expect(service.generateText('Question')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
