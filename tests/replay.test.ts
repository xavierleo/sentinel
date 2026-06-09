import { describe, expect, it } from 'vitest';
import { createReplayRepository } from '../src/observability/replay.js';
import { replaySession } from '../src/observability/replay-runner.js';
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

  it('re-runs user messages and records replay comparison events', async () => {
    const db = createStateDatabase(':memory:');
    const replay = createReplayRepository(db, { now: (() => {
      let time = 10;
      return () => {
        time += 1;
        return time;
      };
    })() });
    replay.recordEvent({ sessionId: 'cli:local:default', actor: 'user', kind: 'message', payload: { text: 'hello' } });
    replay.recordEvent({ sessionId: 'cli:local:default', actor: 'agent', kind: 'message', payload: { text: 'old answer' } });

    const result = await replaySession({
      sourceSessionId: 'cli:local:default',
      replaySessionId: 'replay:1',
      replay,
      runTurn: async (message) => `new answer to ${message}`,
    });

    expect(result).toEqual({
      sourceSessionId: 'cli:local:default',
      replaySessionId: 'replay:1',
      turns: [{ userMessage: 'hello', originalText: 'old answer', replayText: 'new answer to hello' }],
    });
    expect(replay.readSession('replay:1')).toEqual([
      expect.objectContaining({
        actor: 'scheduler',
        kind: 'replay_turn',
        payload: {
          sourceSessionId: 'cli:local:default',
          userMessage: 'hello',
          originalText: 'old answer',
          replayText: 'new answer to hello',
        },
      }),
    ]);
    db.close();
  });
});
