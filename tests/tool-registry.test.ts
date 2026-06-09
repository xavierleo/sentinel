import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultToolRegistry } from '../src/tools/index.js';
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

  it('can return structured validation errors instead of throwing', async () => {
    const execute = vi.fn();
    const registry = createToolRegistry({ structuredErrors: true });
    registry.register({
      name: 'demo_tool',
      description: 'Demo tool',
      schema: z.object({ path: z.string() }),
      annotations: { readOnly: true },
      execute,
    });

    await expect(registry.dispatch('demo_tool', { path: 42 })).resolves.toEqual({
      error: 'Invalid arguments for demo_tool',
      suggestion: 'Check the tool schema and retry with valid arguments.',
      details: expect.stringContaining('Expected string'),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('wraps tool execution failures as structured errors when enabled', async () => {
    const registry = createToolRegistry({ structuredErrors: true });
    registry.register({
      name: 'demo_tool',
      description: 'Demo tool',
      schema: z.object({ path: z.string() }),
      annotations: { readOnly: true },
      execute: async () => {
        throw new Error('file not found');
      },
    });

    await expect(registry.dispatch('demo_tool', { path: '/missing' })).resolves.toEqual({
      error: 'Tool execution failed for demo_tool',
      suggestion: 'Inspect the error and retry with adjusted arguments or a safer tool.',
      details: 'file not found',
    });
  });

  it('truncates oversized tool results with explicit metadata', async () => {
    const registry = createToolRegistry({ maxResultBytes: 32 });
    registry.register({
      name: 'demo_tool',
      description: 'Demo tool',
      schema: z.object({}),
      annotations: { readOnly: true },
      execute: async () => ({ content: 'a'.repeat(200), keep: 'small' }),
    });

    const result = await registry.dispatch('demo_tool', {});

    expect(result).toEqual({
      truncated: true,
      originalBytes: expect.any(Number),
      maxBytes: 32,
      data: expect.stringContaining('[truncated]'),
    });
  });

  it('enables structured errors in the default application registry', async () => {
    const registry = createDefaultToolRegistry();

    await expect(registry.dispatch('fs_read', { path: 42 })).resolves.toEqual({
      error: 'Invalid arguments for fs_read',
      suggestion: 'Check the tool schema and retry with valid arguments.',
      details: expect.stringContaining('Expected string'),
    });
  });

  it('registers workspace and skill tools when a workspace root is configured', () => {
    const registry = createDefaultToolRegistry({ workspace: { root: '/tmp/sentinel-workspace', proposalsRoot: '/tmp/sentinel-proposals' } });

    const names = registry.list().map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'workspace_read',
        'memory_set',
        'memory_replace',
        'memory_remove',
        'user_propose_edit',
        'workspace_propose_edit',
        'workspace_note',
        'skill_index',
        'skill_view',
      ]),
    );
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
