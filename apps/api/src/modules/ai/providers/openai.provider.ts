import fetch from 'node-fetch';

export interface AiResponse {
  text: string;
  tokensUsed?: number;
  model?: string;
  provider?: string;
  raw?: any;
}

export interface AiProvider {
  name: string;
  chat(prompt: string, opts?: any): Promise<AiResponse>;
  summarize(resourceId: string, opts?: any): Promise<AiResponse>;
}

export class OpenAIProvider implements AiProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(prompt: string, opts?: any): Promise<AiResponse> {
    const body = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts?.maxTokens || 1024,
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? JSON.stringify(json);
    const tokens = json?.usage?.total_tokens ?? undefined;

    return { text, tokensUsed: tokens, model: this.model, provider: this.name, raw: json };
  }

  async summarize(resourceId: string, opts?: any): Promise<AiResponse> {
    // For the provider, summarization is a chat prompt asking to summarize resourceId.
    const prompt = `Summarize the key points of resource with id ${resourceId}.`;
    return this.chat(prompt, opts);
  }
}
