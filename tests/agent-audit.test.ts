import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import type { PermissionEngine } from '../src/permissions/types.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent safety and audit flow', () => {
  it('records permission decisions before executing tools', async () => {
    const registry = createToolRegistry();
    const execute = vi.fn().mockResolvedValue({ restarted: false, dryRun: true });
    registry.register({
      name: 'container_action',
      description: 'Act on a container',
      schema: z.object({ name: z.string(), action: z.string(), dry_run: z.boolean().default(true) }),
      annotations: { destructive: true },
      execute,
    });
    const model: ModelClient = {
      completeTurn: vi
        .fn()
        .mockResolvedValueOnce({
          type: 'tool_call',
          id: 'call_1',
          name: 'container_action',
          input: { name: 'sonarr', action: 'restart', dry_run: true },
        })
        .mockResolvedValueOnce({ type: 'text', text: 'restart dry-run recorded' }),
    };
    const permissions: PermissionEngine = {
      evaluate: () => ({ decision: 'ask', reason: 'no permission rule matched' }),
    };
    const auditCalls: string[] = [];

    const result = await runAgentTurn({
      message: 'restart sonarr',
      model,
      tools: registry,
      permissions,
      maxSteps: 3,
      confirm: async () => true,
      audit: {
        recordToolAttempt: (event) => {
          auditCalls.push(`audit:${event.toolName}:${event.permissionDecision}`);
        },
      },
    });

    expect(result.text).toBe('restart dry-run recorded');
    expect(auditCalls).toEqual(['audit:container_action:ask']);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not execute an asked tool call when confirmation is denied', async () => {
    const registry = createToolRegistry();
    const execute = vi.fn();
    registry.register({
      name: 'container_action',
      description: 'Act on a container',
      schema: z.object({ name: z.string(), action: z.string(), dry_run: z.boolean().default(true) }),
      annotations: { destructive: true },
      execute,
    });
    const model: ModelClient = {
      completeTurn: vi
        .fn()
        .mockResolvedValueOnce({
          type: 'tool_call',
          id: 'call_1',
          name: 'container_action',
          input: { name: 'sonarr', action: 'restart', dry_run: false },
        })
        .mockResolvedValueOnce({ type: 'text', text: 'I did not restart it' }),
    };

    await runAgentTurn({
      message: 'restart sonarr',
      model,
      tools: registry,
      permissions: { evaluate: () => ({ decision: 'ask', reason: 'no permission rule matched' }) },
      confirm: async () => false,
    });

    expect(execute).not.toHaveBeenCalled();
  });
});
