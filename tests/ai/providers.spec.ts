import { AiService } from '../../apps/api/src/modules/ai/ai.service';

describe('AI provider selection', () => {
  it('should prefer providers in priority order', async () => {
    // Create fake providers map
    const providers = new Map();
    providers.set('openai', { chat: async (p) => ({ text: 'openai' }) });
    providers.set('anthropic', { chat: async (p) => ({ text: 'anthropic' }) });

    const repo = { log: async () => {} } as any;
    const svc = new AiService(providers, repo);

    process.env.AI_PROVIDER_PRIORITY = 'openai,anthropic';
    const resp = await svc.chat('hello');
    expect(resp.provider).toBe('openai');

    process.env.AI_PROVIDER_PRIORITY = 'anthropic,openai';
    const resp2 = await svc.chat('hello');
    expect(resp2.provider).toBe('anthropic');
  });
});
