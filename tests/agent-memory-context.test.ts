import { describe, expect, it } from 'vitest';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent memory context', () => {
  it('injects memory summary before the user message', async () => {
    const seen: string[][] = [];
    const model: ModelClient = {
      completeTurn: async ({ messages }) => {
        seen.push(messages.map((message) => `${message.role}:${message.content}`));
        return { type: 'text', text: 'sonarr is in memory' };
      },
    };

    const result = await runAgentTurn({
      message: 'what containers do we have?',
      model,
      tools: createToolRegistry(),
      permissions: createDefaultPermissionEngine(),
      memorySummary: 'Inventory memory:\n- container sonarr is running',
    });

    expect(result.text).toBe('sonarr is in memory');
    expect(seen[0]).toEqual([
      'system:Inventory memory:\n- container sonarr is running',
      'user:what containers do we have?',
    ]);
  });
});
