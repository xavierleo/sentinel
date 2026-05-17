import { describe, expect, it } from 'vitest';
import { buildTuiReadModel } from '../../src/tui/read-model.js';
import type { PersistedSnapshotRead } from '../../src/storage/types.js';

function makeSnapshot(overrides: Partial<PersistedSnapshotRead> = {}): PersistedSnapshotRead {
  return {
    snapshotId: 7,
    createdAt: '2026-05-17T10:00:00.000Z',
    hostname: 'cerebro',
    dockerVersion: '29.4.3',
    composeVersion: '5.1.3',
    rawRuntimeInventory: {},
    rawHostStatus: {},
    services: [
      {
        profileId: 'paperless',
        displayName: 'Paperless',
        source: 'runtime_discovery',
        containerName: 'paperless',
        image: 'ghcr.io/paperless-ngx/paperless-ngx:latest',
        status: 'exited',
        health: 'unhealthy',
        composeProject: 'paperless',
        composeService: 'paperless',
        stackDir: '/home/xavier/stacks/paperless',
        restartPolicy: 'unless-stopped',
        createdBySentinel: false,
        firstSeenAt: '2026-05-17T10:00:00.000Z',
        lastSeenAt: '2026-05-17T10:00:00.000Z',
        ports: [],
        mounts: [],
        networks: ['cerebro-net'],
      },
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
        restartPolicy: 'unless-stopped',
        createdBySentinel: false,
        firstSeenAt: '2026-05-17T10:00:00.000Z',
        lastSeenAt: '2026-05-17T10:00:00.000Z',
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

describe('tui read model', () => {
  it('sorts running services ahead of stopped services and selects the first row', () => {
    const model = buildTuiReadModel({
      snapshot: makeSnapshot(),
      now: '2026-05-17T10:01:00.000Z',
      refreshIntervalMs: 300_000,
      selectedIndex: 0,
    });

    expect(model.inventoryRows.map((row) => row.containerName)).toEqual(['sonarr', 'paperless']);
    expect(model.focusService?.containerName).toBe('sonarr');
    expect(model.watchtower.runningCount).toBe(1);
    expect(model.watchtower.stoppedCount).toBe(1);
  });

  it('marks the snapshot stale when the stored snapshot is older than the refresh interval', () => {
    const model = buildTuiReadModel({
      snapshot: makeSnapshot({ createdAt: '2026-05-17T09:00:00.000Z' }),
      now: '2026-05-17T10:00:00.000Z',
      refreshIntervalMs: 300_000,
      selectedIndex: 0,
    });

    expect(model.watchtower.freshness).toBe('stale');
    expect(model.footer.snapshotAgeLabel).toContain('stale');
  });

  it('returns an empty-state view when there is no snapshot', () => {
    const model = buildTuiReadModel({
      snapshot: undefined,
      now: '2026-05-17T10:00:00.000Z',
      refreshIntervalMs: 300_000,
      selectedIndex: 0,
    });

    expect(model.emptyState?.kind).toBe('no_snapshot');
    expect(model.inventoryRows).toEqual([]);
    expect(model.focusService).toBeUndefined();
  });
});
