import { discoverDockerInventory, type RuntimeInventoryResult } from '../discovery/docker-discovery.js';
import { buildRuntimeInventoryPayload } from '../discovery/runtime-inventory.js';
import { createDockerContainerLogsTool } from './containers.js';

export interface ToolDefinition {
  name: string;
  description: string;
  tier: 'system_read';
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolDependencies {
  getRuntimeInventory: () => Promise<unknown>;
  getContainerLogs: (name: string, lines?: number) => Promise<string>;
  getHostStatus: () => Promise<unknown>;
}

export interface RuntimeToolDependencies {
  discoverInventory?: () => Promise<RuntimeInventoryResult>;
  getContainerLogs?: (name: string, lines?: number) => Promise<string>;
  getHostStatus?: () => Promise<unknown>;
}

function requireContainerName(args: Record<string, unknown>): string {
  if (typeof args.name !== 'string' || args.name.trim().length === 0) {
    throw new Error('container_logs requires a non-blank string name');
  }

  return args.name;
}

function optionalPositiveIntegerLines(args: Record<string, unknown>): number | undefined {
  if (args.lines === undefined) {
    return undefined;
  }

  if (typeof args.lines !== 'number' || !Number.isInteger(args.lines) || args.lines <= 0) {
    throw new Error('container_logs lines must be a positive integer');
  }

  return args.lines;
}

export function createToolRegistry(deps: ToolDependencies) {
  const tools = new Map<string, Readonly<ToolDefinition>>();
  const register = (definition: ToolDefinition) => {
    tools.set(definition.name, Object.freeze({ ...definition }));
  };

  register({
    name: 'get_runtime_inventory',
    description: 'Returns compact current runtime inventory summary.',
    tier: 'system_read',
    run: () => deps.getRuntimeInventory(),
  });

  register({
    name: 'list_containers',
    description: 'Returns all discovered runtime service profiles.',
    tier: 'system_read',
    run: async () => {
      const inventory = (await deps.getRuntimeInventory()) as { services?: unknown[] };
      return inventory.services ?? [];
    },
  });

  register({
    name: 'container_logs',
    description: 'Returns recent Docker logs for a container, truncated by default.',
    tier: 'system_read',
    run: async (args) => deps.getContainerLogs(requireContainerName(args), optionalPositiveIntegerLines(args)),
  });

  register({
    name: 'host_status',
    description: 'Returns compact host status.',
    tier: 'system_read',
    run: () => deps.getHostStatus(),
  });

  return {
    get(name: string): Readonly<ToolDefinition> | undefined {
      return tools.get(name);
    },
    listToolNames(): string[] {
      return [...tools.keys()].sort();
    },
  };
}

export function createRuntimeToolRegistry(deps: RuntimeToolDependencies = {}) {
  const discoverInventory = deps.discoverInventory ?? (() => discoverDockerInventory());
  const getContainerLogs = deps.getContainerLogs ?? createDockerContainerLogsTool();

  return createToolRegistry({
    getRuntimeInventory: async () => buildRuntimeInventoryPayload(await discoverInventory()),
    getContainerLogs,
    getHostStatus:
      deps.getHostStatus ??
      (async () => ({
        status: 'not_implemented',
        message: 'host_status is not wired yet',
      })),
  });
}
