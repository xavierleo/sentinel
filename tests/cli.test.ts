import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
import type { RuntimeInventoryResult } from '../src/discovery/docker-discovery.js';
import type { RuntimeServiceProfile } from '../src/discovery/runtime-profile.js';
import type { PersistedSnapshotRead } from '../src/storage/types.js';

function createHarness() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
    stdout,
    stderr,
  };
}

function createSnapshot(overrides: Partial<PersistedSnapshotRead> = {}): PersistedSnapshotRead {
  return {
    snapshotId: 7,
    createdAt: '2026-05-15T10:00:00.000Z',
    hostname: 'sentinel',
    dockerVersion: '27.0.0',
    composeVersion: '2.29.0',
    rawRuntimeInventory: { status: 'ok', profiles: [] },
    rawHostStatus: { hostname: 'sentinel' },
    services: [
      {
        profileId: 'sonarr',
        displayName: 'Sonarr',
        source: 'runtime_discovery',
        containerName: 'sonarr',
        image: 'lscr.io/linuxserver/sonarr:latest',
        status: 'running',
        health: 'healthy',
        composeProject: 'media',
        composeService: 'sonarr',
        stackDir: '/opt/stacks/media',
        createdBySentinel: false,
        firstSeenAt: '2026-05-01T10:00:00.000Z',
        lastSeenAt: '2026-05-15T10:00:00.000Z',
        restartPolicy: 'unless-stopped',
        ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
        mounts: [],
        networks: ['media'],
      },
    ],
    hostStatus: {
      hostname: 'sentinel',
      kernel: 'Linux',
      uptime: '1 day',
      memory: { totalMb: 1, usedMb: 1, freeMb: 0, availableMb: 0 },
      rootDisk: {
        filesystem: '/',
        size: '1G',
        used: '1G',
        available: '0G',
        percentUsed: '100%',
        mountpoint: '/',
      },
      dockerServerVersion: '27.0.0',
      dockerComposeVersion: '2.29.0',
    },
    ...overrides,
  };
}

describe('cli', () => {
  it('prints the version label', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['--version'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Sentinel v1.0 Runtime Awareness']);
    expect(harness.stderr).toEqual([]);
  });

  it('prints help for --help', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['--help'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Usage: sentinel <command>');
  });

  it('reports install status and snapshot absence without pretending the daemon exists', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['status'], harness.io, {
      readLatestSnapshot: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Foundation: installed');
    expect(harness.stdout.join('\n')).toContain('Daemon: not implemented yet');
    expect(harness.stdout.join('\n')).toContain('Snapshots: none');
  });

  it('reports latest snapshot timestamp in status output when stored state exists', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['status'], harness.io, {
      readLatestSnapshot: () => createSnapshot(),
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Snapshots: available');
    expect(harness.stdout.join('\n')).toContain('Latest snapshot: 2026-05-15T10:00:00.000Z');
  });

  it('prints a clean status error and exits 2 when snapshot state cannot be read', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['status'], harness.io, {
      readLatestSnapshot: () => {
        throw new Error('permission denied opening sqlite state');
      },
    });

    expect(exitCode).toBe(2);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['permission denied opening sqlite state']);
  });

  it('runs the daemon command through an injected dependency', async () => {
    const harness = createHarness();
    let runDaemonCalls = 0;

    const exitCode = await runCli(['daemon'], harness.io, {
      runDaemon: async () => {
        runDaemonCalls += 1;
      },
    });

    expect(exitCode).toBe(0);
    expect(runDaemonCalls).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([]);
  });

  it('prints a clean daemon error and exits 2 when startup fails', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['daemon'], harness.io, {
      runDaemon: async () => {
        throw new Error('database is locked');
      },
    });

    expect(exitCode).toBe(2);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['database is locked']);
  });

  it('prints a clean daemon error and exits 2 when runtime refresh fails in the default daemon flow', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.resetModules();
    vi.doMock('../src/config/defaults.js', () => ({
      defaultConfig: {
        storage: { sqlite_path: ':memory:' },
        runtime_inventory: { refresh_interval: '5m' },
      },
    }));
    vi.doMock('../src/storage/sqlite.js', () => ({
      createStateDatabase: () => ({ close: () => {} }),
    }));
    vi.doMock('../src/storage/runtime-snapshots-repository.js', () => ({
      createRuntimeSnapshotsRepository: () => ({}),
    }));
    vi.doMock('../src/tools/host.js', () => ({
      createHostStatusTool: () => async () => ({
        hostname: 'sentinel',
        platform: { kernel: 'Linux' },
        uptime: '1 day',
        memory: { totalMb: 1, usedMb: 1, freeMb: 0, availableMb: 0 },
        rootDisk: {
          filesystem: '/',
          size: '1G',
          used: '1G',
          available: '0G',
          percentUsed: '100%',
          mountpoint: '/',
        },
        docker: { serverVersion: '27.0.0', composeVersion: '2.0.0' },
      }),
    }));
    vi.doMock('../src/daemon/refresh-service.js', () => ({
      createRefreshService: () => ({
        refreshOnce: async () => {
          throw new Error('runtime refresh failed');
        },
      }),
    }));

    try {
      const { runCli: runCliWithMocks } = await import('../src/cli.js');
      const exitCode = await runCliWithMocks(['daemon']);

      expect(exitCode).toBe(2);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith('runtime refresh failed');
    } finally {
      consoleError.mockRestore();
      vi.doUnmock('../src/config/defaults.js');
      vi.doUnmock('../src/storage/sqlite.js');
      vi.doUnmock('../src/storage/runtime-snapshots-repository.js');
      vi.doUnmock('../src/tools/host.js');
      vi.doUnmock('../src/daemon/refresh-service.js');
    }
  });

  it('prints Docker inventory from the latest stored snapshot', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory'], harness.io, {
      discoverInventory: async () => {
        throw new Error('should not rediscover');
      },
      readLatestSnapshot: () => createSnapshot(),
    });

    expect(exitCode).toBe(0);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout.join('\n')).toContain('Sentinel runtime inventory');
    expect(harness.stdout.join('\n')).toContain('Containers: 1 running, 0 stopped');
    expect(harness.stdout.join('\n')).toContain('sonarr');
    expect(harness.stdout.join('\n')).toContain('8989:8989/tcp');
  });

  it('prints structured Docker inventory with inventory --json from the latest stored snapshot', async () => {
    const harness = createHarness();
    const snapshot = createSnapshot({
      services: [
        createSnapshot().services[0],
        {
          profileId: 'tdarr',
          displayName: 'Tdarr',
          source: 'runtime_discovery',
          containerName: 'tdarr',
          image: 'ghcr.io/haveagitgat/tdarr:latest',
          status: 'exited',
          health: 'unknown',
          composeProject: null,
          composeService: null,
          stackDir: null,
          createdBySentinel: false,
          firstSeenAt: '2026-05-10T10:00:00.000Z',
          lastSeenAt: '2026-05-15T10:00:00.000Z',
          restartPolicy: 'on-failure',
          ports: [],
          mounts: [],
          networks: [],
        },
      ],
    });

    const exitCode = await runCli(['inventory', '--json'], harness.io, {
      discoverInventory: async () => {
        throw new Error('should not rediscover');
      },
      readLatestSnapshot: () => snapshot,
    });

    expect(exitCode).toBe(0);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0] ?? '')).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-15T10:00:00.000Z',
      counts: {
        total: 2,
        running: 1,
        stopped: 1,
      },
      services: [
        {
          id: 'sonarr',
          displayName: 'Sonarr',
          source: 'runtime_discovery',
          containerName: 'sonarr',
          image: 'lscr.io/linuxserver/sonarr:latest',
          status: 'running',
          health: 'healthy',
          composeProject: 'media',
          composeService: 'sonarr',
          stackDir: '/opt/stacks/media',
          ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
          mounts: [],
          networks: ['media'],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T10:00:00.000Z',
        },
        {
          id: 'tdarr',
          displayName: 'Tdarr',
          source: 'runtime_discovery',
          containerName: 'tdarr',
          image: 'ghcr.io/haveagitgat/tdarr:latest',
          status: 'exited',
          health: 'unknown',
          ports: [],
          mounts: [],
          networks: [],
          restartPolicy: 'on-failure',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T10:00:00.000Z',
        },
      ],
    });
  });

  it('fails clearly when inventory is requested before any snapshot exists', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory'], harness.io, {
      discoverInventory: async () => {
        throw new Error('should not rediscover');
      },
      readLatestSnapshot: () => undefined,
    });

    expect(exitCode).toBe(2);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([
      'No stored runtime snapshot is available yet. Start `sentinel daemon` and wait for the first refresh.',
    ]);
  });

  it('prints a clean inventory error and exits 2 when stored snapshot state cannot be read', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory', '--json'], harness.io, {
      discoverInventory: async () => {
        throw new Error('should not rediscover');
      },
      readLatestSnapshot: () => {
        throw new Error('database is locked');
      },
    });

    expect(exitCode).toBe(2);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['database is locked']);
  });

  it('preserves firstSeenAt separately from lastSeenAt in daemon inventory mapping', async () => {
    const harness = createHarness();
    const writtenServices: Array<{ firstSeenAt: string; lastSeenAt: string }> = [];
    const inventory: RuntimeInventoryResult = {
      status: 'ok',
      profiles: [
        {
          id: 'sonarr',
          displayName: 'Sonarr',
          source: 'runtime_discovery',
          containerName: 'sonarr',
          image: 'lscr.io/linuxserver/sonarr:latest',
          status: 'running',
          health: 'healthy',
          ports: [],
          mounts: [],
          networks: [],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          firstSeenAt: '2026-05-01T10:00:00.000Z',
          lastSeenAt: '2026-05-15T10:00:00.000Z',
        },
      ],
    } as RuntimeInventoryResult & {
      profiles: Array<RuntimeServiceProfile & { firstSeenAt: string }>;
    };

    vi.resetModules();
    vi.doMock('../src/config/defaults.js', () => ({
      defaultConfig: {
        storage: { sqlite_path: ':memory:' },
        runtime_inventory: { refresh_interval: '5m' },
      },
    }));
    vi.doMock('../src/discovery/docker-discovery.js', () => ({
      discoverDockerInventory: async () => inventory,
    }));
    vi.doMock('../src/storage/sqlite.js', () => ({
      createStateDatabase: () => ({ close: () => {} }),
    }));
    vi.doMock('../src/storage/runtime-snapshots-repository.js', () => ({
      createRuntimeSnapshotsRepository: () => ({}),
    }));
    vi.doMock('../src/tools/host.js', () => ({
      createHostStatusTool: () => async () => ({
        hostname: 'sentinel',
        platform: { kernel: 'Linux' },
        uptime: '1 day',
        memory: { totalMb: 1, usedMb: 1, freeMb: 0, availableMb: 0 },
        rootDisk: {
          filesystem: '/',
          size: '1G',
          used: '1G',
          available: '0G',
          percentUsed: '100%',
          mountpoint: '/',
        },
        docker: { serverVersion: '27.0.0', composeVersion: '2.0.0' },
      }),
    }));
    vi.doMock('../src/daemon/refresh-service.js', () => ({
      createRefreshService: ({ collectRuntimeInventory }: { collectRuntimeInventory: () => Promise<{ services: Array<{ firstSeenAt: string; lastSeenAt: string }> }> }) => ({
        refreshOnce: async () => {
          writtenServices.push(...(await collectRuntimeInventory()).services);
          return 1;
        },
      }),
    }));
    vi.doMock('../src/daemon/runner.js', () => ({
      createDaemonRunner: ({ refreshOnce }: { refreshOnce: () => Promise<number> }) => ({
        run: async () => {
          await refreshOnce();
        },
        stop: () => {},
      }),
    }));

    const { runCli: runCliWithMocks } = await import('../src/cli.js');
    const exitCode = await runCliWithMocks(['daemon'], harness.io);

    expect(exitCode).toBe(0);
    expect(writtenServices).toHaveLength(1);
    expect(writtenServices[0]).toMatchObject({
      firstSeenAt: '2026-05-01T10:00:00.000Z',
      lastSeenAt: '2026-05-15T10:00:00.000Z',
    });
    vi.doUnmock('../src/config/defaults.js');
    vi.doUnmock('../src/discovery/docker-discovery.js');
    vi.doUnmock('../src/storage/sqlite.js');
    vi.doUnmock('../src/storage/runtime-snapshots-repository.js');
    vi.doUnmock('../src/tools/host.js');
    vi.doUnmock('../src/daemon/refresh-service.js');
    vi.doUnmock('../src/daemon/runner.js');
  });

  it('rejects unsupported inventory flags', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory', '--wat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown inventory option: --wat');
  });

  it('prints the same clear inventory error for inventory --json when no snapshot exists', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory', '--json'], harness.io, {
      discoverInventory: async () => {
        throw new Error('should not rediscover');
      },
      readLatestSnapshot: () => undefined,
    });

    expect(exitCode).toBe(2);
    expect(harness.stderr).toEqual([
      'No stored runtime snapshot is available yet. Start `sentinel daemon` and wait for the first refresh.',
    ]);
  });

  it('runs chat with --message through the chat loop', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['chat', '--message', "what's running?"], harness.io, {
      discoverInventory: async () => ({ status: 'ok', profiles: [] }),
      runChat: async (message) => `echo:${message}`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(["echo:what's running?"]);
    expect(harness.stderr).toEqual([]);
  });

  it('prints deterministic inventory chat output for what is running', async () => {
    const harness = createHarness();
    const messages: string[] = [];
    const inventoryResponse = [
      'Sentinel runtime inventory',
      'Containers: 1 running, 0 stopped',
      '',
      'Sonarr | running | 8989:8989/tcp',
    ].join('\n');

    const exitCode = await runCli(['chat', '--message', "what's running?"], harness.io, {
      discoverInventory: async () => ({ status: 'ok', profiles: [] }),
      runChat: async (message) => {
        messages.push(message);
        return inventoryResponse;
      },
    });

    expect(exitCode).toBe(0);
    expect(messages).toEqual(["what's running?"]);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout).toEqual([inventoryResponse]);
  });

  it('prints deterministic log chat output for recent logs', async () => {
    const harness = createHarness();
    const messages: string[] = [];
    const logsResponse = 'Recent logs for sonarr\n\n[line one]\n[line two]';

    const exitCode = await runCli(['chat', '--message', 'show me recent logs for sonarr'], harness.io, {
      discoverInventory: async () => ({ status: 'ok', profiles: [] }),
      runChat: async (message) => {
        messages.push(message);
        return logsResponse;
      },
    });

    expect(exitCode).toBe(0);
    expect(messages).toEqual(['show me recent logs for sonarr']);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout).toEqual([logsResponse]);
    expect(harness.stdout[0]?.split('\n')).toEqual(['Recent logs for sonarr', '', '[line one]', '[line two]']);
  });

  it('rejects chat without --message for now', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['chat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('chat currently requires --message');
  });

  it('rejects unknown commands', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['wat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown command: wat');
  });
});
