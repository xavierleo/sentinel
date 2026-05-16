import { describe, expect, it } from 'vitest';
import { createStateDatabase } from '../../src/storage/sqlite.js';
import { createRuntimeSnapshotsRepository } from '../../src/storage/runtime-snapshots-repository.js';

describe('runtime snapshot repository', () => {
  it('writes and reads the latest stored snapshot with raw and normalized data', () => {
    const db = createStateDatabase(':memory:');
    const repository = createRuntimeSnapshotsRepository(db);

    repository.writeSnapshot({
      createdAt: '2026-05-16T10:00:00.000Z',
      hostname: 'cerebro',
      dockerVersion: '29.4.3',
      composeVersion: '5.1.3',
      rawRuntimeInventory: { services: [{ id: 'sonarr' }] },
      rawHostStatus: { hostname: 'cerebro' },
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
    });

    const latest = repository.readLatestSnapshot();

    expect(latest?.hostname).toBe('cerebro');
    expect(latest?.rawRuntimeInventory).toEqual({ services: [{ id: 'sonarr' }] });
    expect(latest?.services[0]?.containerName).toBe('sonarr');
    expect(latest?.hostStatus.hostname).toBe('cerebro');
  });
});
