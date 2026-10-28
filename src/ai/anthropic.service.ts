import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AskAiDto } from './dto/ask-ai.dto';

interface AnthropicApiResponse {
  content: Array<{ text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

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
export class AnthropicService {
  private apiKey?: string;
  private model: string = 'claude-3-sonnet-20240229';
  private maxTokens: number = 1024;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
  }

  async ask(dto: AskAiDto, userId: string): Promise<AiResponse> {
    if (!this.apiKey) {
      throw new BadRequestException('Anthropic API key not configured');
    }

    try {
      const systemPrompt = 'You are Sophis, an AI study assistant for Sophis Central. Help students learn academic material concisely and accurately. Keep responses under 500 words.';

      const response = await firstValueFrom(
        this.httpService.post<AnthropicApiResponse>(
          'https://api.anthropic.com/v1/messages',
          {
            model: this.model,
            max_tokens: this.maxTokens,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: dto.question,
              },
            ],
          },
          {
            headers: {
              'x-api-key': this.apiKey,
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
            },
          },
        ),
      );

      const answer = response.data.content[0].text;
      const tokensUsed = response.data.usage.input_tokens + response.data.usage.output_tokens;

      return {
        id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'completed',
        question: dto.question,
        answer,
        provider: 'anthropic',
        userId,
        resourceId: dto.resourceId,
        tokensUsed,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      throw new BadRequestException(`AI request failed: ${message}`);
    }
  }
}
