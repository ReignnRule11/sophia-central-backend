import fetch from 'node-fetch';

export class AnthropicProvider {
  name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-2') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(prompt: string, opts?: any) {
    const body = {
      model: this.model,
      prompt: prompt,
      max_tokens_to_sample: opts?.maxTokens || 1024,
    };

    const res = await fetch('https://api.anthropic.com/v1/complete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    const text = json?.completion ?? JSON.stringify(json);
    const tokens = json?.usage?.total_tokens ?? undefined;

    return { text, tokensUsed: tokens, model: this.model, provider: this.name, raw: json };
  }

  async summarize(resourceId: string, opts?: any) {
    const prompt = `Summarize the key points of resource with id ${resourceId}.`;
    return this.chat(prompt, opts);
  }
}
