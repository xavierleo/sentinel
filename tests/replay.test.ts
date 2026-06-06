import { describe, expect, it } from 'vitest';
import { createReplayRepository } from '../src/observability/replay.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('replay repository', () => {
  it('reads replayable events for a session in order', () => {
    const db = createStateDatabase(':memory:');
    const replay = createReplayRepository(db, { now: () => 1 });

    replay.recordEvent({ sessionId: 'cli:local:default', actor: 'user', kind: 'message', payload: { text: 'hello' } });
    replay.recordEvent({ sessionId: 'cli:local:default', actor: 'agent', kind: 'message', payload: { text: 'hi' } });

    expect(replay.readSession('cli:local:default')).toEqual([
      expect.objectContaining({ actor: 'user', kind: 'message', payload: { text: 'hello' } }),
      expect.objectContaining({ actor: 'agent', kind: 'message', payload: { text: 'hi' } }),
    ]);
    db.close();
  });
});
