import { describe, expect, it } from 'vitest';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent budget prompt integration', () => {
  it('injects budget warnings before memory context', async () => {
    const seen: string[][] = [];
    const model: ModelClient = {
      completeTurn: async ({ messages }) => {
        seen.push(messages.map((message) => `${message.role}:${message.content}`));
        return { type: 'text', text: 'ok' };
      },
    };

    await runAgentTurn({
      message: 'status?',
      model,
      tools: createToolRegistry(),
      permissions: createDefaultPermissionEngine(),
      memorySummary: 'Inventory memory: empty',
      budgetWarning: 'Budget soft cap reached. Be concise and avoid unnecessary tool calls.',
    });

    expect(seen[0]).toEqual([
      'system:Budget soft cap reached. Be concise and avoid unnecessary tool calls.',
      'system:Inventory memory: empty',
      'user:status?',
    ]);
  });

  it('refuses a turn when budget policy denies it', async () => {
    const model: ModelClient = {
      completeTurn: async () => {
        throw new Error('model should not be called');
      },
    };

    await expect(
      runAgentTurn({
        message: 'status?',
        model,
        tools: createToolRegistry(),
        permissions: createDefaultPermissionEngine(),
        budgetDecision: { decision: 'deny', reason: 'Budget hard cap reached.' },
      }),
    ).rejects.toThrow('Budget hard cap reached.');
  });
});
