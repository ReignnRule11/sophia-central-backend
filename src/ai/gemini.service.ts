import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface GeminiInteractionResponse {
  status?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
}

export interface AiConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class GeminiService {
  private readonly endpoint = 'https://generativelanguage.googleapis.com/v1/interactions';

  async generateText(
    prompt: string,
    context?: string,
    history: AiConversationTurn[] = [],
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Sophis AI is not configured yet. Please contact the administrator. No Wisdom Points were deducted.',
      );
    }

    // gemini-3.7-flash is listed for the Gemini Developer API Interactions endpoint.
    const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    const conversation = history.length
      ? history.map((turn) => `${turn.role === 'user' ? 'Student' : 'Sophis'}: ${turn.content}`).join('\\n')
      : '';
    const input = [
      context || '',
      conversation ? `Previous conversation:\\n${conversation}` : '',
      `Student's latest question/request: ${prompt}`,
    ].filter(Boolean).join('\\n\\n');

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
            'You are Sophis, the academic study assistant for Sophis Central, a higher-education learning platform. Answer the student\'s actual question directly. Be accurate, clear, supportive, and appropriately detailed. Explain difficult concepts step by step, give examples and practice questions when useful, and ask a focused clarification only when necessary. Use the conversation history to understand follow-up questions and avoid repeating generic advice. Distinguish established facts from uncertainty. Never invent citations, sources, or facts. Use supplied academic resource context when relevant. If only resource metadata is supplied and not the document contents, explicitly say you cannot see the full document.',
          generation_config: {
            temperature: 0.2,
            max_output_tokens: 2048,
          },
          // Keep student prompts and context out of Gemini's stored interaction history.
          store: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Gemini API returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as GeminiInteractionResponse;
      const text = result.output_text?.trim() ||
        result.steps
          ?.filter((step) => step.type === 'model_output')
          .flatMap((step) => step.content || [])
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\\n')
          .trim();

      if (result.status !== 'completed' || !text) {
        throw new Error('Gemini returned no completed text response');
      }

      return text;
    } catch (error) {
      console.error(
        'Gemini generation failed:',
        error instanceof Error ? error.message : 'Unknown provider error',
      );
      throw new ServiceUnavailableException(
        'Sophis AI could not generate a response right now. Please try again shortly. No Wisdom Points were deducted.',
      );
    }
  }
}
