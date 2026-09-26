import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AskAiDto } from './dto/ask-ai.dto';

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  async ask(dto: AskAiDto, userId: string) {
    const provider = this.config.get<string>('AI_PROVIDER');

    if (!provider) {
      throw new ServiceUnavailableException(
        'AI assistance is not configured. Set AI_PROVIDER before enabling this endpoint.',
      );
    }

    // Provider integration belongs behind this boundary. Do not expose provider
    // credentials to clients or send untrusted documents without authorization.
    return {
      status: 'queued',
      provider,
      userId,
      resourceId: dto.resourceId ?? null,
      question: dto.question,
      message: 'AI provider integration is ready to be connected.',
    };
  }
}
