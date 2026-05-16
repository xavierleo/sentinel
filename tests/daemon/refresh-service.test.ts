import { describe, expect, it } from 'vitest';
import { createRefreshService } from '../../src/daemon/refresh-service.js';
import { createRuntimeSnapshotsRepository } from '../../src/storage/runtime-snapshots-repository.js';
import { createStateDatabase } from '../../src/storage/sqlite.js';

describe('refresh service', () => {
  it('collects runtime inventory and host status and persists a combined snapshot', async () => {
    const db = createStateDatabase(':memory:');
    const repository = createRuntimeSnapshotsRepository(db);
    const refreshService = createRefreshService({
      collectRuntimeInventory: async () => ({
        hostname: 'cerebro',
        dockerVersion: '29.4.3',
        composeVersion: '5.1.3',
        rawRuntimeInventory: { services: [{ id: 'sonarr' }] },
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
            firstSeenAt: '2026-05-16T10:00:00.000Z',
            lastSeenAt: '2026-05-16T10:00:00.000Z',
            restartPolicy: 'unless-stopped',
            ports: [],
            mounts: [],
            networks: [],
          },
        ],
      }),
      collectHostStatus: async () => ({
        rawHostStatus: { hostname: 'cerebro' },
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
      }),
      repository,
      now: () => '2026-05-16T10:00:00.000Z',
    });

    const snapshotId = await refreshService.refreshOnce();
    const latest = repository.readLatestSnapshot();

    expect(snapshotId).toBeGreaterThan(0);
    expect(latest?.hostname).toBe('cerebro');
    expect(latest?.services).toHaveLength(1);
    expect(latest?.services[0]?.restartPolicy).toBe('unless-stopped');
    expect(latest?.hostStatus.hostname).toBe('cerebro');
  });
});
