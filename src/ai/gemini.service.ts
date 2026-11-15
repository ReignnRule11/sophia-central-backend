import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface GeminiInteractionResponse {
  status?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
}

interface GeminiProviderError {
  error?: {
    message?: string;
    status?: string;
    code?: number;
  };
}

export interface AiConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class GeminiService {
  // The stable Gemini Developer API Interactions endpoint. Google also exposes
  // a v1beta endpoint; /v1 is supported and must not be downgraded blindly.
  private readonly endpoint = 'https://generativelanguage.googleapis.com/v1/interactions';

  async generateText(
    prompt: string,
    context?: string,
    history: AiConversationTurn[] = [],
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      console.error('Gemini is not configured: GEMINI_API_KEY is missing.');
      throw new ServiceUnavailableException(
        'Sophis AI is not configured yet. Please contact the administrator. No Wisdom Points were deducted.',
      );
    }

    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
    const conversation = history.length
      ? history
          .map((turn) => `${turn.role === 'user' ? 'Student' : 'Sophis'}: ${turn.content}`)
          .join('\n')
      : '';
    // Bound context sent on every turn so unusually long resource descriptions or
    // conversation histories do not inflate provider latency indefinitely.
    const boundedContext = (context || '').slice(0, 6_000);
    const boundedConversation = conversation.slice(-8_000);
    const input = [
      boundedContext,
      boundedConversation ? `Previous conversation:\n${boundedConversation}` : '',
      `Student's latest question/request: ${prompt}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const generationStartedAt = Date.now();
    let attemptCount = 0;
    let providerStatus: number | undefined;
    let inputCharacterCount = 0;

    try {
      const requestBody = JSON.stringify({
        model,
        input,
        system_instruction:
          'You are Sophis, the academic study assistant for Sophis Central, a higher-education learning platform. Answer the student\'s actual question directly. Be accurate, clear, supportive, and appropriately detailed. Explain difficult concepts step by step, give examples and practice questions when useful, and ask a focused clarification only when necessary. Use the conversation history to understand follow-up questions and avoid repeating generic advice. Distinguish established facts from uncertainty. Never invent citations, sources, or facts. Use supplied academic resource context when relevant. If only resource metadata is supplied and not the document contents, explicitly say you cannot see the full document.',
        generation_config: {
          // Lower thinking effort reduces latency for the interactive tutor while
          // preserving enough reasoning for normal academic questions.
          thinking_level: 'low',
          max_output_tokens: 2048,
        },
        // Keep student prompts and context out of Gemini's stored interaction history.
        store: false,
      });

      inputCharacterCount = input.length;

      // Gemini can return 503 while a model is temporarily overloaded. Retry
      // only that transient status, with bounded backoff and one overall deadline.
      const requestDeadline = AbortSignal.timeout(100_000);
      const retryDelaysMs = [1_000, 2_000];
      let response: Response;

      for (let attempt = 0; ; attempt += 1) {
        attemptCount += 1;
        response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: requestBody,
          signal: requestDeadline,
        });

        providerStatus = response.status;
        if (response.status !== 503 || attempt >= retryDelaysMs.length) {
          break;
        }

        const delayMs = retryDelaysMs[attempt];
        console.warn(
          `Gemini returned HTTP 503 for model "${model}". Retrying in ${delayMs}ms (attempt ${attempt + 2}/3).`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const responseBody = await response.text();
      let result: GeminiInteractionResponse | undefined;

      try {
        result = responseBody ? (JSON.parse(responseBody) as GeminiInteractionResponse) : undefined;
      } catch {
        throw new Error(
          `Gemini returned non-JSON data (HTTP ${response.status}): ${responseBody.slice(0, 500)}`,
        );
      }

      if (!response.ok) {
        const providerError = result as GeminiProviderError | undefined;
        const detail =
          providerError?.error?.message ||
          providerError?.error?.status ||
          responseBody.slice(0, 500) ||
          response.statusText;
        throw new Error(
          `Gemini API HTTP ${response.status} for model "${model}": ${detail}`,
        );
      }

      if (!result) {
        throw new Error('Gemini returned an empty response body');
      }

      const text =
        result.output_text?.trim() ||
        result.steps
          ?.filter((step) => step.type === 'model_output')
          .flatMap((step) => step.content || [])
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
          .trim();

      if (result.status !== 'completed' || !text) {
        throw new Error(
          `Gemini interaction did not complete successfully (status: ${result.status || 'missing'}; model: ${model}; text: ${Boolean(text)}).`,
        );
      }

      console.info('Gemini generation completed', {
        model,
        durationMs: Date.now() - generationStartedAt,
        attempts: attemptCount,
        providerStatus,
        historyTurns: history.length,
        inputCharacters: inputCharacterCount,
        outputCharacters: text.length,
      });
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        console.error('Gemini generation timed out', {
          model,
          durationMs: Date.now() - generationStartedAt,
          attempts: attemptCount,
          providerStatus,
          historyTurns: history.length,
          inputCharacters: inputCharacterCount,
        });
      } else {
        console.error('Gemini generation failed', {
          model,
          durationMs: Date.now() - generationStartedAt,
          attempts: attemptCount,
          providerStatus,
          historyTurns: history.length,
          inputCharacters: inputCharacterCount,
          error: message,
        });
      }
      throw new ServiceUnavailableException(
        'Sophis AI could not generate a response right now. Please try again shortly. No Wisdom Points were deducted.',
      );
    }
  }
}
