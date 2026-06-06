import type { DoctorResult } from '../ops/doctor.js';

export interface DaemonStopHandle {
  stop: () => Promise<void>;
}

export interface DaemonRunnerOptions {
  runStartupChecks: () => Promise<DoctorResult>;
  startHealthServer: () => Promise<DaemonStopHandle>;
  refreshOnce: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  refreshIntervalMs: number;
}

export function createDaemonRunner(options: DaemonRunnerOptions) {
  let stopped = false;
  let health: DaemonStopHandle | undefined;

  async function start(): Promise<void> {
    if (health) {
      return;
    }

    const doctor = await options.runStartupChecks();
    if (!doctor.ok) {
      const failures = doctor.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.name}: ${check.message}`)
        .join(', ');
      throw new Error(`Startup checks failed: ${failures}`);
    }

    health = await options.startHealthServer();
  }

  return {
    async runOnce(): Promise<void> {
      await start();
      await options.refreshOnce();
    },

    async runForever(): Promise<void> {
      await start();
      while (!stopped) {
        await options.refreshOnce();
        if (!stopped) {
          await options.sleep(options.refreshIntervalMs);
        }
      }
    },

    async stop(): Promise<void> {
      stopped = true;
      await health?.stop();
      health = undefined;
    },
  };
}
