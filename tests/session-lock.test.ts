import { describe, expect, it } from 'vitest';
import { createSessionLockManager } from '../src/sessions/lock-manager.js';

describe('session lock manager', () => {
  it('runs work for the same session sequentially', async () => {
    const locks = createSessionLockManager();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = locks.withSessionLock('cli:local:default', async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
    });
    const second = locks.withSessionLock('cli:local:default', async () => {
      events.push('second');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });
});
