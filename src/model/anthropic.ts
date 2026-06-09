import Anthropic from '@anthropic-ai/sdk';
import type { ModelUsage } from './types.js';
import type { ModelClient, ModelMessage, ModelTurnResult } from './types.js';

const pricingPerMillionTokens: Record<string, { input: number; output: number; cachedInput: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15, cachedInput: 0.3 },
};

function usageFromResponse(response: Anthropic.Messages.Message, model: string): ModelUsage | undefined {
  const usage = response.usage;
  if (!usage) {
    return undefined;
  }

  const tokensIn = usage.input_tokens ?? 0;
  const tokensOut = usage.output_tokens ?? 0;
  const cachedTokensIn = usage.cache_read_input_tokens ?? 0;
  const pricing = pricingPerMillionTokens[model];
  const costUsd = pricing
    ? ((tokensIn - cachedTokensIn) * pricing.input + cachedTokensIn * pricing.cachedInput + tokensOut * pricing.output) / 1_000_000
    : 0;

  return {
    provider: 'anthropic',
    model,
    tokensIn,
    tokensOut,
    cachedTokensIn,
    costUsd,
  };
}

function toAnthropicMessages(messages: ModelMessage[]): Anthropic.Messages.MessageParam[] {
  const converted: Anthropic.Messages.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      continue;
    }

    if (message.role === 'tool') {
      converted.push({
        role: 'user',
        content: `Tool observation:\n${message.content}`,
      });
      continue;
    }

    converted.push({
      role: message.role,
      content: message.content,
    });
  }

  return converted;
}

function toAnthropicSystem(messages: ModelMessage[]) {
  const systemMessages = messages.filter((message) => message.role === 'system');
  if (systemMessages.length === 0) {
    return undefined;
  }

  return systemMessages.map((message, index) => ({
    type: 'text' as const,
    text: message.content,
    cache_control: index < 2 ? ({ type: 'ephemeral' as const } as const) : undefined,
  }));
}

export function createAnthropicModelClient(options: {
  apiKey: string | undefined;
  model?: string;
  maxTokens?: number;
}): ModelClient {
  if (!options.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const client = new Anthropic({ apiKey: options.apiKey });
  const model = options.model ?? 'claude-sonnet-4-20250514';
  const maxTokens = options.maxTokens ?? 1024;

  return {
    async completeTurn(request): Promise<ModelTurnResult> {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: toAnthropicSystem(request.messages),
        messages: toAnthropicMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema,
        })),
      });

      const toolUse = response.content.find((block) => block.type === 'tool_use');
      if (toolUse?.type === 'tool_use') {
        return {
          type: 'tool_call',
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
          usage: usageFromResponse(response, model),
        };
      }

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
        .trim();

      return { type: 'text', text, usage: usageFromResponse(response, model) };
    },
  };
}
