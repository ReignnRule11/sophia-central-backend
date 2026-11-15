import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface AiConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class GroqService {
  private readonly endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly overallTimeoutMs = 50_000;
  private readonly perAttemptTimeoutMs = 15_000;

  async generateText(
    prompt: string,
    context?: string,
    history: AiConversationTurn[] = [],
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Groq is not configured.');
    }

    const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
    const conversation = history.length
      ? history
          .map((turn) => `${turn.role === 'user' ? 'Student' : 'Sophis'}: ${turn.content}`)
          .join('\\n')
      : '';
    const input = [
      (context || '').slice(0, 6_000),
      conversation ? `Previous conversation:\\n${conversation.slice(-8_000)}` : '',
      `Student's latest question/request: ${prompt}`,
    ]
      .filter(Boolean)
      .join('\\n\\n');

    const messages = [
      {
        role: 'system',
        content:
          "You are Sophis, the academic study assistant for Sophis Central, a higher-education learning platform. Answer the student's actual question directly. Be accurate, clear, supportive, and appropriately detailed. Explain difficult concepts step by step, give examples and practice questions when useful, and ask a focused clarification only when necessary. Use the conversation history to understand follow-up questions and avoid repeating generic advice. Distinguish established facts from uncertainty. Never invent citations, sources, or facts. Use supplied academic resource context when relevant. If only resource metadata is supplied and not the document contents, explicitly say you cannot see the full document.",
      },
      { role: 'user', content: input },
    ];

    const requestBody = JSON.stringify({
      model,
      messages,
      max_completion_tokens: 2_048,
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
    });

    const startedAt = Date.now();
    const deadlineAt = startedAt + this.overallTimeoutMs;
    const overallController = new AbortController();
    let overallTimedOut = false;
    let attempts = 0;
    let providerStatus: number | undefined;
    const attemptDurationsMs: number[] = [];
    const overallTimer = setTimeout(() => {
      overallTimedOut = true;
      overallController.abort();
    }, this.overallTimeoutMs);

    try {
      const retryDelaysMs = [1_000, 2_000];

      for (let attempt = 0; ; attempt += 1) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0 || overallController.signal.aborted) {
          overallTimedOut = true;
          throw new Error('Groq overall deadline exceeded');
        }

        attempts += 1;
        const attemptController = new AbortController();
        let attemptTimedOut = false;
        const abortForOverallDeadline = () => attemptController.abort();
        overallController.signal.addEventListener('abort', abortForOverallDeadline, { once: true });
        const attemptTimer = setTimeout(() => {
          attemptTimedOut = true;
          attemptController.abort();
        }, Math.min(this.perAttemptTimeoutMs, remainingMs));
        const attemptStartedAt = Date.now();

        let response: Response | undefined;
        let responseBody = '';
        try {
          response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: requestBody,
            signal: attemptController.signal,
          });
          providerStatus = response.status;
          responseBody = await response.text();
        } catch {
          if (overallTimedOut) throw new Error('Groq overall deadline exceeded');
          // Treat network failures and stalled response-body reads as transient.
          response = undefined;
          responseBody = '';
          if (!attemptTimedOut) {
            console.warn('Groq request failed before receiving a complete response.', {
              durationMs: Date.now() - startedAt,
              attempts,
            });
          }
        } finally {
          attemptDurationsMs.push(Date.now() - attemptStartedAt);
          clearTimeout(attemptTimer);
          overallController.signal.removeEventListener('abort', abortForOverallDeadline);
        }

        const timedOut = attemptTimedOut;
        const retryableStatus =
          response?.status === 408 ||
          response?.status === 500 ||
          response?.status === 502 ||
          response?.status === 503 ||
          response?.status === 504;
        const retryableNetworkFailure = !response && !timedOut && !overallTimedOut;

        if (response?.ok) {
          let payload: GroqChatResponse;
          try {
            payload = JSON.parse(responseBody) as GroqChatResponse;
          } catch {
            throw new Error('Groq returned an invalid response body.');
          }
          const answer = payload.choices?.[0]?.message?.content?.trim();
          if (!answer) throw new Error('Groq returned an empty completion.');
          console.info('Groq generation completed', {
            model,
            durationMs: Date.now() - startedAt,
            attempts,
            attemptDurationsMs,
            providerStatus,
            historyTurns: history.length,
            inputCharacters: input.length,
            outputCharacters: answer.length,
          });
          return answer;
        }

        const shouldRetry = timedOut || retryableStatus || retryableNetworkFailure;
        if (!shouldRetry || attempt >= retryDelaysMs.length) {
          console.warn('Groq generation unavailable; fallback may be required.', {
            model,
            durationMs: Date.now() - startedAt,
            attempts,
            attemptDurationsMs,
            providerStatus,
            timedOut,
          });
          throw new ServiceUnavailableException('Groq could not generate a response.');
        }

        const delayMs = retryDelaysMs[attempt];
        if (deadlineAt - Date.now() <= delayMs) {
          throw new ServiceUnavailableException('Groq retry deadline reached.');
        }
        console.warn('Retrying transient Groq failure.', {
          model,
          attempt: attempts,
          delayMs,
          providerStatus,
          timedOut,
        });

        await new Promise<void>((resolve, reject) => {
          const retryTimer = setTimeout(() => {
            overallController.signal.removeEventListener('abort', abortRetry);
            resolve();
          }, delayMs);
          const abortRetry = () => {
            clearTimeout(retryTimer);
            overallController.signal.removeEventListener('abort', abortRetry);
            overallTimedOut = true;
            reject(new Error('Groq overall deadline exceeded'));
          };
          overallController.signal.addEventListener('abort', abortRetry, { once: true });
        });
      }
    } catch (error) {
      console.error('Groq generation failed.', {
        model,
        durationMs: Date.now() - startedAt,
        attempts,
        attemptDurationsMs,
        providerStatus,
        overallTimedOut,
      });
      throw new ServiceUnavailableException('Groq could not generate a response.');
    } finally {
      clearTimeout(overallTimer);
    }
  }
}
