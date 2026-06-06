import { describe, expect, it } from 'vitest';
import { createSessionRepository } from '../src/sessions/repository.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('session repository', () => {
  it('persists conversation messages in order', () => {
    const db = createStateDatabase(':memory:');
    const sessions = createSessionRepository(db, { now: () => 1 });

    sessions.ensureSession({ id: 'cli:local:default', channel: 'cli', userId: 'local' });
    sessions.appendMessage({ sessionId: 'cli:local:default', role: 'user', content: 'hello' });
    sessions.appendMessage({ sessionId: 'cli:local:default', role: 'assistant', content: 'hi' });

    expect(sessions.readMessages('cli:local:default')).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'hi' }),
    ]);
    db.close();
  });

  it('marks stale in-flight sessions failed on startup recovery', () => {
    const db = createStateDatabase(':memory:');
    const sessions = createSessionRepository(db, { now: () => 10 });

    sessions.ensureSession({ id: 'telegram:42:99', channel: 'telegram', userId: '42' });
    sessions.markStepStarted({ sessionId: 'telegram:42:99', stepId: 'step-1' });

    expect(sessions.recoverInFlightSessions({ failedAt: 20 })).toEqual([{ sessionId: 'telegram:42:99', stepId: 'step-1' }]);
    expect(sessions.readInFlightSteps()).toEqual([]);
    expect(sessions.readFailedSteps()).toEqual([
      expect.objectContaining({ sessionId: 'telegram:42:99', stepId: 'step-1', failedAt: 20 }),
    ]);
    db.close();
  });
});
