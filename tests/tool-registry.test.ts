import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '../src/tools/registry.js';

describe('tool registry', () => {
  it('rejects invalid arguments before execution', async () => {
    const execute = vi.fn();
    const registry = createToolRegistry();
    registry.register({
      name: 'demo_tool',
      description: 'Demo tool',
      schema: z.object({ path: z.string() }),
      annotations: { readOnly: true },
      execute,
    });

    await expect(registry.dispatch('demo_tool', { path: 42 })).rejects.toThrow('Invalid arguments for demo_tool');
    expect(execute).not.toHaveBeenCalled();
  });

  it('exposes JSON-schema-compatible tool definitions', () => {
    const registry = createToolRegistry();
    registry.register({
      name: 'demo_tool',
      description: 'Demo tool',
      schema: z.object({ path: z.string() }),
      annotations: { readOnly: true },
      execute: async () => ({ ok: true }),
    });

    expect(registry.listForModel()).toEqual([
      expect.objectContaining({
        name: 'demo_tool',
        description: 'Demo tool',
        input_schema: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            path: expect.objectContaining({ type: 'string' }),
          }),
        }),
      }),
    ]);
  });
});
