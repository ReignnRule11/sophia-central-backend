import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AskAiDto } from './dto/ask-ai.dto';

export interface AiResponse {
  id: string;
  status: string;
  question: string;
  answer?: string;
  provider: string;
  userId: string;
  resourceId?: string;
  tokensUsed?: number;
  createdAt: string;
}

@Injectable()
export class OpenAiService {
  private apiKey: string;
  private model: string;
  private maxTokens: number = 500;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.model = this.config.get<string>('OPENAI_MODEL') || 'gpt-3.5-turbo';
  }

  async ask(dto: AskAiDto, userId: string): Promise<AiResponse> {
    if (!this.apiKey) {
      throw new BadRequestException('OpenAI API key not configured');
    }

    try {
      const systemPrompt = 'You are Sophia, an AI study assistant for Sophia Central. Help students learn academic material concisely and accurately. Keep responses under 500 words.';

      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: dto.question },
            ],
            max_tokens: this.maxTokens,
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const answer = response.data.choices[0].message.content;
      const tokensUsed = response.data.usage.total_tokens;

      return {
        id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'completed',
        question: dto.question,
        answer,
        provider: 'openai',
        userId,
        resourceId: dto.resourceId,
        tokensUsed,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new BadRequestException(`AI request failed: ${error.message}`);
    }
  }
}
