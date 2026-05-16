export interface DaemonRunnerDependencies {
  refreshOnce: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  refreshIntervalMs: number;
  logger: {
    info: (message: string) => void;
  };
}

export function createDaemonRunner(deps: DaemonRunnerDependencies) {
  let stopped = false;
  let wake: (() => void) | undefined;

  return {
    async run(): Promise<void> {
      while (!stopped) {
        try {
          const snapshotId = await deps.refreshOnce();
          deps.logger.info(`Stored runtime snapshot ${snapshotId}`);
        } catch (error) {
          throw error;
        }

        if (stopped) {
          return;
        }

        await Promise.race([
          deps.sleep(deps.refreshIntervalMs),
          new Promise<void>((resolve) => {
            wake = resolve;
          }),
        ]);
        wake = undefined;
      }
    },
    stop(): void {
      stopped = true;
      wake?.();
    },
  };
}
