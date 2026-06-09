import type { ModelClient, ModelMessage, ModelTurnResult, ModelUsage } from './types.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface OpenAIResponse {
  output?: {
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    content?: { type?: string; text?: string }[];
  }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string };
}

interface RetryableModelError extends Error {
  retryable?: boolean;
  status?: number;
}

const pricingPerMillionTokens: Record<string, { input: number; output: number; cachedInput: number }> = {
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
};

function usageFromResponse(response: OpenAIResponse, model: string): ModelUsage | undefined {
  if (!response.usage) {
    return undefined;
  }

  const tokensIn = response.usage.input_tokens ?? 0;
  const tokensOut = response.usage.output_tokens ?? 0;
  const cachedTokensIn = response.usage.input_tokens_details?.cached_tokens ?? 0;
  const pricing = pricingPerMillionTokens[model];
  const costUsd = pricing
    ? ((tokensIn - cachedTokensIn) * pricing.input + cachedTokensIn * pricing.cachedInput + tokensOut * pricing.output) /
      1_000_000
    : 0;

  return {
    provider: 'openai',
    model,
    tokensIn,
    tokensOut,
    cachedTokensIn,
    costUsd,
  };
}

function toOpenAIInput(messages: ModelMessage[]) {
  return messages.map((message) => ({
    role: message.role === 'tool' ? 'user' : message.role,
    content: message.role === 'tool' ? `Tool observation:\n${message.content}` : message.content,
  }));
}

function retryableError(message: string, status: number): RetryableModelError {
  const error = new Error(message) as RetryableModelError;
  error.status = status;
  error.retryable = status === 429 || status >= 500;
  return error;
}

export function createOpenAIModelClient(options: {
  apiKey: string | undefined;
  model?: string;
  maxTokens?: number;
  fetch?: FetchLike;
}): ModelClient {
  if (!options.apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const model = options.model ?? 'gpt-4.1-mini';
  const fetchImpl = options.fetch ?? fetch;

  return {
    async completeTurn(request): Promise<ModelTurnResult> {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: toOpenAIInput(request.messages),
          max_output_tokens: options.maxTokens ?? 1024,
          tools: request.tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          })),
        }),
      });
      const body = (await response.json()) as OpenAIResponse;
      if (!response.ok) {
        throw retryableError(body.error?.message ?? `OpenAI request failed: ${response.status}`, response.status);
      }

      const toolCall = body.output?.find((item) => item.type === 'function_call');
      if (toolCall?.name) {
        return {
          type: 'tool_call',
          id: toolCall.call_id ?? toolCall.name,
          name: toolCall.name,
          input: toolCall.arguments ? JSON.parse(toolCall.arguments) : {},
          usage: usageFromResponse(body, model),
        };
      }

      const text =
        body.output
          ?.flatMap((item) => item.content ?? [])
          .filter((content) => content.type === 'output_text')
          .map((content) => content.text ?? '')
          .join('\n')
          .trim() ?? '';

      return { type: 'text', text, usage: usageFromResponse(body, model) };
    },
  };
}
