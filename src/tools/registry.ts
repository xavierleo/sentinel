import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ModelToolDefinition, ToolDefinition, ToolRegistry } from './types.js';

function toModelInputSchema(schema: ToolDefinition['schema']): ModelToolDefinition['input_schema'] {
  const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' }) as Record<string, unknown>;

  return {
    ...jsonSchema,
    type: 'object',
  };
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();

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
        throw new Error(`Invalid arguments for ${name}: ${parsed.error.message}`);
      }

      if (!tool.timeoutMs) {
        return tool.execute(parsed.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), tool.timeoutMs);

      try {
        return await tool.execute(parsed.data, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
