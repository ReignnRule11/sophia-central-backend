import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GroqService, AiConversationTurn } from './groq.service';

@Injectable()
export class AiProviderService {
  constructor(
    private readonly groqService: GroqService,
    private readonly geminiService: GeminiService,
  ) {}

  async generateText(
    prompt: string,
    context?: string,
    history: AiConversationTurn[] = [],
  ): Promise<string> {
    try {
      return await this.groqService.generateText(prompt, context, history);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.warn('Primary AI provider Groq failed; attempting Gemini fallback.');
    }

    try {
      return await this.geminiService.generateText(prompt, context, history);
    } catch {
      throw new ServiceUnavailableException(
        'Sophis AI could not generate a response right now. Please try again shortly. No Wisdom Points were deducted.',
      );
    }
  }
}
