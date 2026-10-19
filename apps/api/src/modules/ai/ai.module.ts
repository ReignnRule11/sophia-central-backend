import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiRepository } from './ai.repository';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { AzureOpenAIProvider } from './providers/azure-openai.provider';
import { LlamaProvider } from './providers/llama.provider';

@Global()
@Module({
  providers: [
    AiService,
    AiRepository,
    {
      provide: 'AI_PROVIDERS',
      useFactory: () => {
        const providers = new Map<string, any>();

        if (process.env.OPENAI_API_KEY) {
          providers.set('openai', new OpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL));
        }
        if (process.env.ANTHROPIC_API_KEY) {
          providers.set('anthropic', new AnthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL));
        }
        if (process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT) {
          providers.set('azure', new AzureOpenAIProvider(process.env.AZURE_OPENAI_ENDPOINT, process.env.AZURE_OPENAI_KEY, process.env.AZURE_OPENAI_DEPLOYMENT));
        }
        if (process.env.LLM_HOST) {
          providers.set('llama', new LlamaProvider(process.env.LLM_HOST, process.env.LLM_API_KEY));
        }

        return providers;
      },
    },
  ],
  exports: [AiService, 'AI_PROVIDERS', AiRepository],
})
export class AiModule {}
