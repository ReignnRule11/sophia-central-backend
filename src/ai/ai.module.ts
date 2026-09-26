import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiService } from './openai.service';
import { AnthropicService } from './anthropic.service';

@Module({
  imports: [HttpModule],
  controllers: [AiController],
  providers: [AiService, ConfigService, OpenAiService, AnthropicService],
  exports: [AiService, OpenAiService, AnthropicService],
})
export class AiModule {}
