export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

export interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'mistral') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}\n\nAssistant:`;

    const req: OllamaGenerateRequest = {
      model: this.model,
      prompt: fullPrompt,
      stream: false,
      temperature: 0.7,
      top_p: 0.95,
      top_k: 40,
    };

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama error (${res.status}): ${text || res.statusText}`);
    }

    const data = (await res.json()) as OllamaGenerateResponse;
    return (data.response || '').trim();
  }
}

