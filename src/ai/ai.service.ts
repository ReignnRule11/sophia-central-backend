import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiService } from './openai.service';
import { AnthropicService } from './anthropic.service';
import { AskAiDto } from './dto/ask-ai.dto';

@Injectable()
export class AiService {
  private provider: string;

  constructor(
    private readonly config: ConfigService,
    private readonly openAiService: OpenAiService,
    private readonly anthropicService: AnthropicService,
  ) {
    this.provider = this.config.get<string>('AI_PROVIDER') || 'none';
  }

  async ask(dto: AskAiDto, userId: string) {
    if (this.provider === 'openai') {
      return this.openAiService.ask(dto, userId);
    } else if (this.provider === 'anthropic') {
      return this.anthropicService.ask(dto, userId);
    } else {
      throw new BadRequestException(
        'AI assistance is not configured. Set AI_PROVIDER to "openai" or "anthropic" before using this feature.',
      );
    }
  }
}
