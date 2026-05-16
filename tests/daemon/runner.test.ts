import { describe, expect, it } from 'vitest';
import { createDaemonRunner } from '../../src/daemon/runner.js';

describe('daemon runner', () => {
  it('refreshes immediately when the daemon starts', async () => {
    const calls: string[] = [];
    let runner!: ReturnType<typeof createDaemonRunner>;

    runner = createDaemonRunner({
      refreshOnce: async () => {
        calls.push('refresh');
        runner.stop();
        return 42;
      },
      sleep: async () => {
        calls.push('sleep');
      },
      refreshIntervalMs: 1000,
      logger: {
        info: () => {},
      },
    });

    await runner.run();

    expect(calls).toEqual(['refresh']);
  });

  it('stops promptly while waiting for the next refresh interval', async () => {
    let resolveSleep!: () => void;
    let sleepStarted!: Promise<void>;

    const runner = createDaemonRunner({
      refreshOnce: async () => 42,
      sleep: async () => {
        sleepStarted = Promise.resolve();
        await new Promise<void>((resolve) => {
          resolveSleep = resolve;
        });
      },
      refreshIntervalMs: 1000,
      logger: {
        info: () => {},
      },
    });

    const runPromise = runner.run();
    await sleepStarted;

    runner.stop();

    await Promise.race([
      runPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('runner did not stop promptly')), 50)),
    ]);

    resolveSleep();
    await runPromise;
  });

  it('rejects when a refresh fails', async () => {
    const runner = createDaemonRunner({
      refreshOnce: async () => {
        throw new Error('refresh failed');
      },
      sleep: async () => {},
      refreshIntervalMs: 1000,
      logger: {
        info: () => {},
      },
    });

    await expect(runner.run()).rejects.toThrow('refresh failed');
  });
});
