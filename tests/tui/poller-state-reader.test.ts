import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../../src/config/defaults.js';
import { createRuntimeSnapshotsRepository } from '../../src/storage/runtime-snapshots-repository.js';
import { createStateDatabase } from '../../src/storage/sqlite.js';
import type { PersistedSnapshotWrite } from '../../src/storage/types.js';
import { createSnapshotPoller } from '../../src/tui/poller.js';
import { createSnapshotStateReader } from '../../src/tui/state-reader.js';

function makeSnapshot(overrides: Partial<PersistedSnapshotWrite> = {}): PersistedSnapshotWrite {
  return {
    createdAt: '2026-05-17T10:00:00.000Z',
    hostname: 'cerebro',
    dockerVersion: '29.4.3',
    composeVersion: '5.1.3',
    rawRuntimeInventory: {},
    rawHostStatus: {},
    services: [
      {
        profileId: 'sonarr',
        displayName: 'Sonarr',
        source: 'runtime_discovery',
        containerName: 'sonarr',
        image: 'lscr.io/linuxserver/sonarr:latest',
        status: 'running',
        health: 'unknown',
        composeProject: 'sonarr',
        composeService: 'sonarr',
        stackDir: '/opt/stacks/sonarr',
        createdBySentinel: false,
        firstSeenAt: '2026-05-17T10:00:00.000Z',
        lastSeenAt: '2026-05-17T10:00:00.000Z',
        restartPolicy: 'unless-stopped',
        ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
        mounts: [],
        networks: ['cerebro-net'],
      },
    ],
    hostStatus: {
      hostname: 'cerebro',
      kernel: 'Linux 7.0.0-15-generic x86_64',
      uptime: 'up 8 days',
      memory: { totalMb: 15295, usedMb: 8162, freeMb: 7133, availableMb: 7133 },
      rootDisk: {
        filesystem: '/dev/nvme0n1p2',
        size: '915G',
        used: '110G',
        available: '805G',
        percentUsed: '12%',
        mountpoint: '/',
      },
      dockerServerVersion: '29.4.3',
      dockerComposeVersion: '5.1.3',
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('snapshot poller', () => {
  it('does not notify again when the latest snapshot id is unchanged', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];

    const poller = createSnapshotPoller({
      readLatestSnapshot: () => ({ snapshotId: 7, ...makeSnapshot() }),
      intervalMs: 10,
      onSnapshot: (snapshot) => {
        if (snapshot) {
          seen.push(snapshot.snapshotId);
        }
      },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(30);
    poller.refreshNow();

    expect(seen).toEqual([7]);
  });

  it('refreshNow reads immediately and notifies when the snapshot id changes', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    let snapshotId = 1;

    const poller = createSnapshotPoller({
      readLatestSnapshot: () => ({ snapshotId, ...makeSnapshot() }),
      intervalMs: 60_000,
      onSnapshot: (snapshot) => {
        if (snapshot) {
          seen.push(snapshot.snapshotId);
        }
      },
    });

    poller.start();
    snapshotId = 2;
    poller.refreshNow();

    expect(seen).toEqual([1, 2]);
  });

  it('stop prevents future interval-driven notifications', async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    let snapshotId = 1;

    const poller = createSnapshotPoller({
      readLatestSnapshot: () => ({ snapshotId, ...makeSnapshot() }),
      intervalMs: 10,
      onSnapshot: (snapshot) => {
        if (snapshot) {
          seen.push(snapshot.snapshotId);
        }
      },
    });

    poller.start();
    poller.stop();
    snapshotId = 2;
    await vi.advanceTimersByTimeAsync(30);

    expect(seen).toEqual([1]);
  });
});

describe('snapshot state reader', () => {
  it('reads the latest snapshot from the configured sqlite database path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'sentinel-tui-'));
    const dbPath = join(tempDir, 'state.db');
    const previousPath = defaultConfig.storage.sqlite_path;
    defaultConfig.storage.sqlite_path = dbPath;

    try {
      const db = createStateDatabase(dbPath);
      const repository = createRuntimeSnapshotsRepository(db);
      repository.writeSnapshot(makeSnapshot({ createdAt: '2026-05-17T10:00:00.000Z', hostname: 'older' }));
      repository.writeSnapshot(makeSnapshot({ createdAt: '2026-05-17T10:05:00.000Z', hostname: 'latest' }));
      db.close();

      const reader = createSnapshotStateReader();
      const snapshot = reader.readLatestSnapshot();

      expect(snapshot?.hostname).toBe('latest');
      expect(snapshot?.createdAt).toBe('2026-05-17T10:05:00.000Z');
      expect(snapshot?.services[0]?.containerName).toBe('sonarr');
      expect(snapshot?.hostStatus.hostname).toBe('cerebro');
    } finally {
      defaultConfig.storage.sqlite_path = previousPath;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
