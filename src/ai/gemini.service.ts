import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface GeminiInteractionResponse {
  status?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
}

@Injectable()
export class GeminiService {
  private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';

  async generateText(prompt: string, context?: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'The AI service is not configured. Please contact the administrator. No Wisdom Points were deducted.',
      );
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const input = context
      ? `${context}\n\nStudent question/request: ${prompt}`
      : prompt;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          input,
          system_instruction:
            'You are the academic study assistant for Sophis Central, a higher-education learning platform. Give accurate, clear, structured explanations appropriate for university students. Explain difficult concepts step by step, distinguish established facts from uncertainty, and never invent citations, sources, or facts. Use the supplied student and resource context when relevant. If the context does not contain the actual contents of a document, do not claim to have read that document.',
          generation_config: {
            temperature: 0.2,
            max_output_tokens: 2048,
          },
          // Student prompts and profile/resource context should not be retained by Gemini.
          store: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        // Do not expose provider response bodies or credentials to API clients.
        throw new Error(`Gemini API returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as GeminiInteractionResponse;
      const text = result.output_text?.trim() ||
        result.steps
          ?.filter((step) => step.type === 'model_output')
          .flatMap((step) => step.content || [])
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
          .trim();

      if (result.status !== 'completed' || !text) {
        throw new Error('Gemini returned no completed text response');
      }

      return text;
    } catch (error) {
      // Keep provider details in server logs only; never fall back to a fabricated answer.
      console.error(
        'Gemini generation failed:',
        error instanceof Error ? error.message : 'Unknown provider error',
      );
      throw new ServiceUnavailableException(
        'The AI service is temporarily unavailable. Please try again shortly. No Wisdom Points were deducted.',
      );
    }
  }
}
