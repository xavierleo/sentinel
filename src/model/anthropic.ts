import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelMessage, ModelTurnResult } from './types.js';

function toAnthropicMessages(messages: ModelMessage[]): Anthropic.Messages.MessageParam[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        content: `Tool observation:\n${message.content}`,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
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
        };
      }

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
        .trim();

      return { type: 'text', text };
    },
  };
}
