import { describe, expect, it, vi } from 'vitest';
import { createRuntimeToolRegistry, createToolRegistry } from '../../src/tools/index.js';
import type { RuntimeInventoryResult } from '../../src/discovery/docker-discovery.js';

describe('tool registry', () => {
  it('only exposes v1.0 read-only tools', () => {
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [], host: { hostname: 'cerebro' } }),
      getContainerLogs: async () => 'log line',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    expect(registry.listToolNames()).toEqual([
      'container_logs',
      'get_runtime_inventory',
      'host_status',
      'list_containers',
    ]);
    expect(registry.get('restart_container')).toBeUndefined();
    expect(registry.get('read_file')).toBeUndefined();
  });

  it('container_logs forwards valid name and positive integer lines to getContainerLogs', async () => {
    const getContainerLogs = vi.fn(async () => 'log line');
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [] }),
      getContainerLogs,
      getHostStatus: async () => ({}),
    });

    await expect(registry.get('container_logs')?.run({ name: 'api', lines: 250 })).resolves.toBe('log line');

    expect(getContainerLogs).toHaveBeenCalledWith('api', 250);
  });

  it('container_logs throws for missing name and does not call getContainerLogs', async () => {
    const getContainerLogs = vi.fn(async () => 'log line');
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [] }),
      getContainerLogs,
      getHostStatus: async () => ({}),
    });

    await expect(registry.get('container_logs')?.run({})).rejects.toThrow('name');

    expect(getContainerLogs).not.toHaveBeenCalled();
  });

  it.each([
    ['blank name', { name: '   ' }],
    ['non-string name', { name: 123 }],
  ])('container_logs throws for invalid %s and does not call getContainerLogs', async (_case, args) => {
    const getContainerLogs = vi.fn(async () => 'log line');
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [] }),
      getContainerLogs,
      getHostStatus: async () => ({}),
    });

    await expect(registry.get('container_logs')?.run(args)).rejects.toThrow('name');

    expect(getContainerLogs).not.toHaveBeenCalled();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative number', -1],
    ['zero', 0],
    ['decimal', 1.5],
    ['non-number', '100'],
  ])('container_logs throws for invalid lines value %s and does not call getContainerLogs', async (_case, lines) => {
    const getContainerLogs = vi.fn(async () => 'log line');
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [] }),
      getContainerLogs,
      getHostStatus: async () => ({}),
    });

    await expect(registry.get('container_logs')?.run({ name: 'api', lines })).rejects.toThrow('lines');

    expect(getContainerLogs).not.toHaveBeenCalled();
  });

  it('mutating a returned definition does not affect subsequent registry get result', () => {
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [] }),
      getContainerLogs: async () => 'log line',
      getHostStatus: async () => ({}),
    });

    const definition = registry.get('container_logs') as any;
    try {
      definition.name = 'mutated';
      definition.description = 'mutated';
      definition.tier = 'mutated';
    } catch {
      // Frozen definitions can throw in strict mode; either way the registry must remain unchanged.
    }

    expect(registry.get('container_logs')).toMatchObject({
      name: 'container_logs',
      description: 'Returns recent Docker logs for a container, truncated by default.',
      tier: 'system_read',
    });
  });

  it('wires get_runtime_inventory to Docker discovery with structured counts', async () => {
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
          health: 'unknown',
          ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
          mounts: [],
          networks: ['cerebro-net'],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T14:55:42.949Z',
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
          networks: ['cerebro-net'],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T14:55:43.949Z',
        },
      ],
    };
    const discoverInventory = vi.fn(async () => inventory);
    const registry = createRuntimeToolRegistry({ discoverInventory });

    await expect(registry.get('get_runtime_inventory')?.run({})).resolves.toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-15T14:55:42.949Z',
      counts: {
        total: 2,
        running: 1,
        stopped: 1,
      },
      services: inventory.profiles,
    });
    expect(discoverInventory).toHaveBeenCalledOnce();
  });

  it('wires list_containers to Docker discovery profiles', async () => {
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
          health: 'unknown',
          ports: [],
          mounts: [],
          networks: [],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T14:55:42.949Z',
        },
      ],
    };
    const registry = createRuntimeToolRegistry({
      discoverInventory: async () => inventory,
    });

    await expect(registry.get('list_containers')?.run({})).resolves.toEqual(inventory.profiles);
  });

  it('returns structured inventory errors from get_runtime_inventory', async () => {
    const registry = createRuntimeToolRegistry({
      discoverInventory: async () => ({ status: 'daemon_unavailable', message: 'Docker daemon unavailable.' }),
    });

    await expect(registry.get('get_runtime_inventory')?.run({})).resolves.toEqual({
      schemaVersion: 1,
      generatedAt: expect.any(String),
      counts: {
        total: 0,
        running: 0,
        stopped: 0,
      },
      services: [],
      error: {
        status: 'daemon_unavailable',
        message: 'Docker daemon unavailable.',
      },
    });
  });
});
