import { describe, expect, it } from 'vitest';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent reflection memory hook', () => {
  it('records an end-of-turn learned note when provided', async () => {
    const notes: string[] = [];
    const model: ModelClient = {
      completeTurn: async () => ({ type: 'text', text: 'sonarr is running' }),
    };

    await runAgentTurn({
      message: 'what did we learn?',
      model,
      tools: createToolRegistry(),
      permissions: createDefaultPermissionEngine(),
      reflection: {
        summarize: async () => 'Sonarr was confirmed running.',
        recordNote: async (body) => {
          notes.push(body);
        },
      },
    });

    expect(notes).toEqual(['Sonarr was confirmed running.']);
  });
});
