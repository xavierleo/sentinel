import { describe, expect, it } from 'vitest';
import { runAgentTurn } from '../src/agent/loop.js';
import type { ModelClient } from '../src/model/types.js';
import { createDefaultPermissionEngine } from '../src/permissions/engine.js';
import { createSessionRepository } from '../src/sessions/repository.js';
import { createStateDatabase } from '../src/storage/database.js';
import { createToolRegistry } from '../src/tools/registry.js';

describe('agent session persistence', () => {
  it('persists user and assistant messages around a completed turn', async () => {
    const db = createStateDatabase(':memory:');
    const sessions = createSessionRepository(db, { now: () => 1 });
    const model: ModelClient = {
      completeTurn: async () => ({ type: 'text', text: 'hello back' }),
    };

    await runAgentTurn({
      message: 'hello',
      model,
      tools: createToolRegistry(),
      permissions: createDefaultPermissionEngine(),
      sessionId: 'cli:local:default',
      sessions,
    });

    expect(sessions.readMessages('cli:local:default')).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'hello back' }),
    ]);
    expect(sessions.readInFlightSteps()).toEqual([]);
    db.close();
  });
});
