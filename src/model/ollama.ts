import type { ModelClient, ModelTurnResult } from './types.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export function createOllamaModelClient(options: {
  baseUrl: string;
  model?: string;
  fetch?: FetchLike;
}): ModelClient {
  const fetchImpl = options.fetch ?? fetch;
  const model = options.model ?? 'llama3.1';
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  return {
    async completeTurn(request): Promise<ModelTurnResult> {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: request.messages.map((message) => ({
            role: message.role === 'tool' ? 'user' : message.role,
            content: message.role === 'tool' ? `Tool observation:\n${message.content}` : message.content,
          })),
        }),
      });
      const body = (await response.json()) as OllamaChatResponse;
      if (!response.ok) {
        throw new Error(body.error ?? `Ollama request failed: ${response.status}`);
      }

      return {
        type: 'text',
        text: body.message?.content?.trim() ?? '',
        usage: {
          provider: 'ollama',
          model,
          tokensIn: body.prompt_eval_count ?? 0,
          tokensOut: body.eval_count ?? 0,
          cachedTokensIn: 0,
          costUsd: 0,
        },
      };
    },
  };
}
