import { Inject, Injectable } from '@nestjs/common';
import { AiRepository } from './ai.repository';

@Injectable()
export class AiService {
  constructor(
    @Inject('AI_PROVIDERS') private readonly providers: Map<string, any>,
    private readonly aiRepo: AiRepository,
  ) {}

  private getProviderOrder(): string[] {
    const env = process.env.AI_PROVIDER_PRIORITY || process.env.AI_PROVIDER_DEFAULT || '';
    if (!env) {
      // default order
      return ['openai', 'anthropic', 'azure', 'llama'].filter(p => this.providers.has(p));
    }

    return env.split(',').map(s => s.trim()).filter(p => this.providers.has(p));
  }

  private async callProvider(providerName: string, method: 'chat' | 'summarize', args: any) {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Provider ${providerName} not configured`);
    return provider[method](...args);
  }

  async chat(prompt: string, contextId?: string, opts?: any) {
    const order = this.getProviderOrder();
    let lastError: any = null;
    for (const p of order) {
      try {
        const start = Date.now();
        const resp = await this.callProvider(p, 'chat', [prompt, opts]);
        const duration = Date.now() - start;

        // log usage
        await this.aiRepo.log({ userId: opts?.userId, provider: p, model: resp.model, tokens: resp.tokensUsed, costEstimate: undefined, prompt, resultSummary: resp.text, metadata: { duration } });

        return { provider: p, result: resp.text };
      } catch (err) {
        lastError = err;
        // try next provider
      }
    }

    throw lastError ?? new Error('No AI providers available');
  }

  async summarizeResource(resourceId: string, opts?: any) {
    const order = this.getProviderOrder();
    let lastError: any = null;
    for (const p of order) {
      try {
        const start = Date.now();
        const resp = await this.callProvider(p, 'summarize', [resourceId, opts]);
        const duration = Date.now() - start;

        await this.aiRepo.log({ userId: opts?.userId, provider: p, model: resp.model, tokens: resp.tokensUsed, costEstimate: undefined, prompt: `summarize:${resourceId}`, resultSummary: resp.text, resourceId, metadata: { duration } });

        return { provider: p, summary: resp.text };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error('No AI providers available');
  }
}
