import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ModelToolDefinition, ToolDefinition, ToolRegistry } from './types.js';

export interface ToolRegistryOptions {
  maxResultBytes?: number;
  structuredErrors?: boolean;
}

const defaultMaxResultBytes = 4096;

function toModelInputSchema(schema: ToolDefinition['schema']): ModelToolDefinition['input_schema'] {
  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' }) as Record<string, unknown>;

  return {
    ...jsonSchema,
    type: 'object',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function structuredValidationError(name: string, details: string) {
  return {
    error: `Invalid arguments for ${name}`,
    suggestion: 'Check the tool schema and retry with valid arguments.',
    details,
  };
}

function structuredExecutionError(name: string, error: unknown) {
  return {
    error: `Tool execution failed for ${name}`,
    suggestion: 'Inspect the error and retry with adjusted arguments or a safer tool.',
    details: errorMessage(error),
  };
}

function truncateResultIfNeeded(value: unknown, maxBytes: number): unknown {
  const serialized = JSON.stringify(value);
  const bytes = Buffer.from(serialized, 'utf8');
  if (bytes.byteLength <= maxBytes) {
    return value;
  }

  return {
    truncated: true,
    originalBytes: bytes.byteLength,
    maxBytes,
    data: `${bytes.subarray(0, maxBytes).toString('utf8')}\n[truncated]`,
  };
}

export function createToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();
  const maxResultBytes = options.maxResultBytes ?? defaultMaxResultBytes;

  return {
    register(tool) {
      if (tools.has(tool.name)) {
        throw new Error(`Tool already registered: ${tool.name}`);
      }

      tools.set(tool.name, tool);
    },

    list() {
      return [...tools.values()];
    },

    listForModel() {
      return [...tools.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: toModelInputSchema(tool.schema),
      }));
    },

    get(name) {
      return tools.get(name);
    },

    async dispatch(name, input) {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const parsed = tool.schema.safeParse(input);
      if (!parsed.success) {
        if (options.structuredErrors) {
          return structuredValidationError(name, parsed.error.message);
        }

        throw new Error(`Invalid arguments for ${name}: ${parsed.error.message}`);
      }

      try {
        if (!tool.timeoutMs) {
          return truncateResultIfNeeded(await tool.execute(parsed.data), maxResultBytes);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), tool.timeoutMs);

        try {
          return truncateResultIfNeeded(await tool.execute(parsed.data, controller.signal), maxResultBytes);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        if (options.structuredErrors) {
          return structuredExecutionError(name, error);
        }

        throw error;
      }
    },
  };
}
