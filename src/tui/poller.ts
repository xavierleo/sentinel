import type { PersistedSnapshotRead } from '../storage/types.js';

interface SnapshotPollerOptions {
  readLatestSnapshot: () => PersistedSnapshotRead | undefined;
  intervalMs: number;
  onSnapshot: (snapshot: PersistedSnapshotRead | undefined) => void;
}

export interface SnapshotPoller {
  start: () => void;
  refreshNow: () => void;
  stop: () => void;
}

export function createSnapshotPoller(options: SnapshotPollerOptions): SnapshotPoller {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSnapshotId: number | undefined;

  const tick = () => {
    const snapshot = options.readLatestSnapshot();

    if (snapshot?.snapshotId !== lastSnapshotId) {
      lastSnapshotId = snapshot?.snapshotId;
      options.onSnapshot(snapshot);
    }
  };

  return {
    start() {
      if (timer) {
        return;
      }
      tick();
      timer = setInterval(tick, options.intervalMs);
    },
    refreshNow() {
      tick();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
