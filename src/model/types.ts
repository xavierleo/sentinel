import type { ModelToolDefinition } from '../tools/types.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  cacheControl?: boolean;
}

export interface ModelUsage {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  costUsd: number;
}

export type ModelTurnResult =
  | {
      type: 'text';
      text: string;
      usage?: ModelUsage;
    }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      input: unknown;
      usage?: ModelUsage;
    };

export interface ModelClient {
  completeTurn: (request: { messages: ModelMessage[]; tools: ModelToolDefinition[] }) => Promise<ModelTurnResult>;
}
