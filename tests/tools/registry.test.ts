import { describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '../../src/tools/index.js';

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
});
