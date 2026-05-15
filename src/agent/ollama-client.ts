import type { SentinelConfig } from '../config/schema.js';

interface OllamaGenerateResponse {
  response?: unknown;
}

export function createOllamaDecisionCaller(config: SentinelConfig) {
  return async (prompt: string): Promise<string> => {
    const response = await fetch(new URL('/api/generate', config.agent.ollama_url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.agent.model,
        prompt,
        stream: false,
        options: {
          temperature: config.agent.temperature,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const body = (await response.json()) as OllamaGenerateResponse;
    if (typeof body.response !== 'string' || body.response.trim().length === 0) {
      throw new Error('Ollama returned an empty response');
    }

    return body.response;
  };
}
