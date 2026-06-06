import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createInMemoryTracer } from '../src/observability/tracer.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent observability', () => {
  it('traces turns, model calls, and tool dispatches', async () => {
    const tracer = createInMemoryTracer();
    const tools = createToolRegistry();
    tools.register({
      name: 'fs_list',
      description: 'List files',
      schema: z.object({ path: z.string() }),
      annotations: { readOnly: true },
      execute: async () => ({ entries: [] }),
    });
    let calls = 0;
    const model: ModelClient = {
      completeTurn: async () => {
        calls += 1;
        return calls === 1 ? { type: 'tool_call', id: '1', name: 'fs_list', input: { path: '/tmp' } } : { type: 'text', text: 'done' };
      },
    };

    await runAgentTurn({
      message: 'list tmp',
      model,
      tools,
      permissions: createDefaultPermissionEngine(),
      tracer,
    });

    expect(tracer.listSpans().map((span) => span.name)).toEqual(['model_call', 'tool_dispatch', 'model_call', 'turn']);
  });
});
