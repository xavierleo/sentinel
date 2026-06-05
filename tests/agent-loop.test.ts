import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createPermissionEngineV0 } from '../src/permissions/engine.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent loop', () => {
  it('dispatches a tool call, appends observation, and returns final text', async () => {
    const registry = createToolRegistry();
    registry.register({
      name: 'container_list',
      description: 'List containers',
      schema: z.object({}),
      annotations: { readOnly: true },
      execute: async () => ({ containers: [{ name: 'sonarr', state: 'running' }] }),
    });
    const seenMessages: string[][] = [];
    const model: ModelClient = {
      completeTurn: async ({ messages }) => {
        seenMessages.push(messages.map((message) => message.content));
        if (seenMessages.length === 1) {
          return { type: 'tool_call', id: 'call_1', name: 'container_list', input: {} };
        }
        return { type: 'text', text: 'sonarr is running' };
      },
    };

    const result = await runAgentTurn({
      message: 'what containers are running?',
      model,
      tools: registry,
      permissions: createPermissionEngineV0(),
      maxSteps: 3,
    });

    expect(result).toEqual({ text: 'sonarr is running', steps: 2 });
    expect(seenMessages.at(1)?.join('\n')).toContain('"name":"sonarr"');
  });

  it('stops cleanly on max-step exhaustion', async () => {
    const registry = createToolRegistry();
    registry.register({
      name: 'fs_list',
      description: 'List files',
      schema: z.object({ path: z.string() }),
      annotations: { readOnly: true },
      execute: async () => ({ entries: [] }),
    });
    const model: ModelClient = {
      completeTurn: async () => ({ type: 'tool_call', id: 'call_1', name: 'fs_list', input: { path: '/tmp' } }),
    };

    await expect(
      runAgentTurn({
        message: 'loop forever',
        model,
        tools: registry,
        permissions: createPermissionEngineV0(),
        maxSteps: 1,
      }),
    ).rejects.toThrow('Agent turn exceeded max steps');
  });
});
