import { describe, expect, it } from 'vitest';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createCostLedger } from '../src/observability/cost-ledger.js';
import { createReplayRepository } from '../src/observability/replay.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createStateDatabase } from '../src/storage/database.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent cost and replay integration', () => {
  it('records model usage into the cost ledger', async () => {
    const db = createStateDatabase(':memory:');
    const costLedger = createCostLedger(db, { now: () => Date.UTC(2026, 5, 6, 10, 0, 0) });
    const model: ModelClient = {
      completeTurn: async () => ({
        type: 'text',
        text: 'hello back',
        usage: {
          provider: 'anthropic',
          model: 'claude-sonnet-4',
          tokensIn: 100,
          tokensOut: 20,
          cachedTokensIn: 10,
          costUsd: 0.0042,
        },
      }),
    };

    await runAgentTurn({
      message: 'hello',
      model,
      tools: createToolRegistry(),
      permissions: createDefaultPermissionEngine(),
      sessionId: 'cli:local:default',
      costLedger,
    });

    expect(costLedger.summarize({ from: Date.UTC(2026, 5, 6), to: Date.UTC(2026, 5, 7) })).toEqual({
      calls: 1,
      tokensIn: 100,
      tokensOut: 20,
      cachedTokensIn: 10,
      costUsd: 0.0042,
    });
    db.close();
  });

  it('records replay events for user and assistant messages', async () => {
    const db = createStateDatabase(':memory:');
    const replay = createReplayRepository(db, { now: () => 1 });
    const model: ModelClient = {
      completeTurn: async () => ({ type: 'text', text: 'status is green' }),
    };

    await runAgentTurn({
      message: 'status?',
      model,
      tools: createToolRegistry(),
      permissions: createDefaultPermissionEngine(),
      sessionId: 'cli:local:default',
      replay,
    });

    expect(replay.readSession('cli:local:default')).toEqual([
      expect.objectContaining({ actor: 'user', kind: 'message', payload: { text: 'status?' } }),
      expect.objectContaining({ actor: 'agent', kind: 'message', payload: { text: 'status is green' } }),
    ]);
    db.close();
  });
});
