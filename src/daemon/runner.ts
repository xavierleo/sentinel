export interface DaemonRunnerDependencies {
  refreshOnce: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  refreshIntervalMs: number;
  logger: {
    info: (message: string) => void;
    error: (message: string) => void;
  };
}

export function createDaemonRunner(deps: DaemonRunnerDependencies) {
  let stopped = false;

  return {
    async run(): Promise<void> {
      while (!stopped) {
        try {
          const snapshotId = await deps.refreshOnce();
          deps.logger.info(`Stored runtime snapshot ${snapshotId}`);
        } catch (error) {
          deps.logger.error(error instanceof Error ? error.message : String(error));
        }

        if (stopped) {
          return;
        }

        await deps.sleep(deps.refreshIntervalMs);
      }
    },
    stop(): void {
      stopped = true;
    },
  };
}
