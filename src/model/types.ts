import type { ModelToolDefinition } from '../tools/types.js';

export interface ModelMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

export type ModelTurnResult =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      input: unknown;
    };

export interface ModelClient {
  completeTurn: (request: { messages: ModelMessage[]; tools: ModelToolDefinition[] }) => Promise<ModelTurnResult>;
}
