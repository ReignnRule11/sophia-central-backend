import { Controller, Post, Body } from '@nestjs/common';
import { IsString } from 'class-validator';

class ChatDto {
  @IsString()
  question: string;

  // Optional: pass resource ids or context
  @IsString()
  contextId?: string;
}

class SummarizeDto {
  @IsString()
  resourceId: string;
}

@Controller('v1/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatDto) {
    const resp = await this.aiService.chat(body.question, body.contextId);
    return { answer: resp };
  }

  @Post('summarize')
  async summarize(@Body() body: SummarizeDto) {
    const resp = await this.aiService.summarizeResource(body.resourceId);
    return { summary: resp };
  }
}

// Minimal service stub. In the real app this would call OpenAI/Anthropic/local LLM agent.
export class AiService {
  async chat(question: string, contextId?: string) {
    // TODO: load resource context, embeddings, or vector DB results
    // For MVP provide a placeholder response and log usage
    await this.logUsage({ type: 'chat', prompt: question, contextId });
    return `This is a placeholder answer to: ${question}`;
  }

  async summarizeResource(resourceId: string) {
    await this.logUsage({ type: 'summarize', resourceId });
    return `Placeholder summary for resource ${resourceId}`;
  }

  private async logUsage(entry: any) {
    // Persist to ai_usage_logs table via repository/TypeORM in real impl
    console.log('AI usage log', entry);
  }
}
