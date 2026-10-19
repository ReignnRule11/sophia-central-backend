import fetch from 'node-fetch';

export class AzureOpenAIProvider {
  name = 'azure';
  private endpoint: string;
  private key: string;
  private deployment: string;

  constructor(endpoint: string, key: string, deployment: string) {
    this.endpoint = endpoint.replace(/\/+$/,'');
    this.key = key;
    this.deployment = deployment;
  }

  private url(path: string) {
    // Azure OpenAI REST path (deployment name encoded in URL)
    return `${this.endpoint}/openai/deployments/${this.deployment}/${path}?api-version=2024-06-01`;
  }

  async chat(prompt: string, opts?: any) {
    const body = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts?.maxTokens || 1024,
    };

    const res = await fetch(this.url('chat/completions'), {
      method: 'POST',
      headers: {
        'api-key': this.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.deployment, ...body }),
    });

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? JSON.stringify(json);
    const tokens = json?.usage?.total_tokens ?? undefined;

    return { text, tokensUsed: tokens, model: this.deployment, provider: this.name, raw: json };
  }

  async summarize(resourceId: string, opts?: any) {
    const prompt = `Summarize the key points of resource with id ${resourceId}.`;
    return this.chat(prompt, opts);
  }
}
