import { describe, expect, it } from 'vitest';
import { runAgentTurn } from '../src/agent/loop.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createToolRegistry } from '../src/tools/registry.js';
import type { ToolDefinition } from '../src/tools/types.js';
import { z } from 'zod';

describe('agent confirmation remember decision', () => {
  it('records a remembered permission before dispatching the approved tool call', async () => {
    const events: string[] = [];
    const registry = createToolRegistry();
    const tool: ToolDefinition<unknown, { ok: boolean }> = {
      name: 'container_action',
      description: 'test action',
      schema: z.object({ name: z.string(), action: z.string(), dry_run: z.boolean() }),
      annotations: { destructive: true },
      async execute() {
        events.push('dispatch');
        return { ok: true };
      },
    };
    registry.register(tool);

    const result = await runAgentTurn({
      message: 'restart plex',
      tools: registry,
      permissions: createDefaultPermissionEngine(),
      confirm: async () => 'remember',
      rememberPermission: async ({ tool, input }) => {
        events.push(`remember:${tool.name}:${JSON.stringify(input)}`);
      },
      model: {
        completeTurn: async ({ messages }) => {
          if (messages.some((message) => message.role === 'tool')) {
            return { type: 'text', text: 'done' };
          }

          return {
            type: 'tool_call',
            id: 'tool-1',
            name: 'container_action',
            input: { name: 'plex', action: 'restart', dry_run: false },
          };
        },
      },
    });

    expect(result.text).toBe('done');
    expect(events).toEqual([
      'remember:container_action:{"name":"plex","action":"restart","dry_run":false}',
      'dispatch',
    ]);
  });
});
