import type { z } from 'zod';

export interface ToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  network?: boolean;
}

export interface ToolDefinition<TArgs = any, TResult = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TArgs>;
  annotations: ToolAnnotations;
  timeoutMs?: number;
  execute: (args: TArgs, signal?: AbortSignal) => Promise<TResult>;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    [key: string]: unknown;
  };
}

export interface ToolRegistry {
  register: (tool: ToolDefinition) => void;
  list: () => ToolDefinition[];
  listForModel: () => ModelToolDefinition[];
  get: (name: string) => ToolDefinition | undefined;
  dispatch: (name: string, input: unknown) => Promise<unknown>;
}
