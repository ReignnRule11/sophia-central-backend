import fetch from 'node-fetch';

export class LlamaProvider {
  name = 'llama';
  private host: string;
  private apiKey?: string;

  constructor(host: string, apiKey?: string) {
    this.host = host.replace(/\/+$/,'');
    this.apiKey = apiKey;
  }

  async chat(prompt: string, opts?: any) {
    // Assumes a generic HTTP inference API that accepts {prompt}
    const res = await fetch(`${this.host}/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ prompt, max_tokens: opts?.maxTokens || 1024 }),
    });

    const json = await res.json();
    const text = json?.text ?? JSON.stringify(json);
    return { text, tokensUsed: undefined, model: 'llama', provider: this.name, raw: json };
  }

  async summarize(resourceId: string, opts?: any) {
    const prompt = `Summarize the key points of resource with id ${resourceId}.`;
    return this.chat(prompt, opts);
  }
}
