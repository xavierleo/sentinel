import { describe, expect, it } from 'vitest';
import { createDaemonRunner } from '../src/daemon/runner.js';

describe('daemon runner', () => {
  it('runs startup checks, starts health, and refreshes once', async () => {
    const events: string[] = [];
    const runner = createDaemonRunner({
      runStartupChecks: async () => {
        events.push('doctor');
        return { ok: true, checks: [] };
      },
      startHealthServer: async () => {
        events.push('health');
        return {
          stop: async () => {
            events.push('health-stop');
          },
        };
      },
      refreshOnce: async () => {
        events.push('refresh');
      },
      sleep: async () => {
        events.push('sleep');
      },
      refreshIntervalMs: 15 * 60_000,
    });

    await runner.runOnce();
    await runner.stop();

    expect(events).toEqual(['doctor', 'health', 'refresh', 'health-stop']);
  });

  it('recovers in-flight sessions before startup checks and health begin', async () => {
    const events: string[] = [];
    const runner = createDaemonRunner({
      recoverInFlightSessions: async () => {
        events.push('recover');
      },
      runStartupChecks: async () => {
        events.push('doctor');
        return { ok: true, checks: [] };
      },
      startHealthServer: async () => {
        events.push('health');
        return {
          stop: async () => {
            events.push('health-stop');
          },
        };
      },
      refreshOnce: async () => {
        events.push('refresh');
      },
      sleep: async () => {
        events.push('sleep');
      },
      refreshIntervalMs: 15 * 60_000,
    });

    await runner.runOnce();
    await runner.stop();

    expect(events).toEqual(['recover', 'doctor', 'health', 'refresh', 'health-stop']);
  });

  it('refuses to start when startup checks fail', async () => {
    const runner = createDaemonRunner({
      runStartupChecks: async () => ({ ok: false, checks: [{ name: 'database', ok: false, message: 'locked' }] }),
      startHealthServer: async () => ({ stop: async () => {} }),
      refreshOnce: async () => {},
      sleep: async () => {},
      refreshIntervalMs: 1,
    });

    await expect(runner.runOnce()).rejects.toThrow('Startup checks failed: database: locked');
  });
});
