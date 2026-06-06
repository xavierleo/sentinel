import { z } from 'zod';
import type { MemoryRepository } from '../memory/repository.js';
import type { ToolDefinition } from './types.js';

const memorySearchSchema = z.object({
  query: z.string().min(1),
  kinds: z.array(z.enum(['inventory', 'notes', 'episodic'])).optional(),
  limit: z.number().int().positive().max(50).default(10),
});

const memoryGetSchema = z.object({
  entity_id: z.string().min(1),
});

const memoryNoteSchema = z.object({
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
  entity: z.string().optional(),
});

const memoryRememberSchema = z.object({
  entity: z.string().min(1),
  attribute: z.string().min(1),
  value: z.string().min(1),
});

const memorySetPreferenceSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

export function createMemorySearchTool(memory: MemoryRepository): ToolDefinition<
  z.input<typeof memorySearchSchema>,
  { results: ReturnType<MemoryRepository['search']> }
> {
  return {
    name: 'memory_search',
    description: 'Search Sentinel memory across inventory and notes.',
    schema: memorySearchSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = memorySearchSchema.parse(args);
      return {
        results: memory.search(parsed),
      };
    },
  };
}

export function createMemoryGetTool(memory: MemoryRepository): ToolDefinition<
  z.input<typeof memoryGetSchema>,
  { entity: ReturnType<MemoryRepository['getEntity']> }
> {
  return {
    name: 'memory_get',
    description: 'Read a single memory entity by entity id.',
    schema: memoryGetSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = memoryGetSchema.parse(args);
      return {
        entity: memory.getEntity(parsed.entity_id),
      };
    },
  };
}

export function createMemoryNoteTool(memory: MemoryRepository): ToolDefinition<z.input<typeof memoryNoteSchema>, { id: number }> {
  return {
    name: 'memory_note',
    description: 'Write an operational memory note.',
    schema: memoryNoteSchema,
    annotations: { readOnly: false },
    async execute(args) {
      const parsed = memoryNoteSchema.parse(args);
      return {
        id: memory.addNote({
          body: parsed.body,
          tags: parsed.tags,
          entityId: parsed.entity,
        }),
      };
    },
  };
}

export function createMemoryRememberTool(memory: MemoryRepository): ToolDefinition<
  z.input<typeof memoryRememberSchema>,
  { entity: string; attribute: string; value: string }
> {
  return {
    name: 'memory_remember',
    description: 'Remember a configuration fact about an entity.',
    schema: memoryRememberSchema,
    annotations: { readOnly: false },
    async execute(args) {
      const parsed = memoryRememberSchema.parse(args);
      memory.remember({
        entityId: parsed.entity,
        attribute: parsed.attribute,
        value: parsed.value,
      });
      return parsed;
    },
  };
}

export function createMemorySetPreferenceTool(memory: MemoryRepository): ToolDefinition<
  z.input<typeof memorySetPreferenceSchema>,
  { key: string; value: string }
> {
  return {
    name: 'memory_set_preference',
    description: 'Store an explicit user preference. Use only when the user clearly asks Sentinel to remember a preference.',
    schema: memorySetPreferenceSchema,
    annotations: { readOnly: false },
    async execute(args) {
      const parsed = memorySetPreferenceSchema.parse(args);
      memory.setPreference(parsed.key, parsed.value);
      return parsed;
    },
  };
}
