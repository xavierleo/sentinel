import {
  createContainerActionTool,
  createContainerInspectTool,
  createContainerListTool,
  createContainerLogsTool,
  createContainerStatsTool,
} from './container.js';
import { createDiscoverNetworkTool, createDiscoverServicesTool, createDiscoverVolumesTool } from './discovery.js';
import {
  createFsDiskUsageTool,
  createFsListTool,
  createFsReadTool,
  createFsSearchTool,
  createFsStatTool,
  createFsWriteTool,
} from './fs.js';
import {
  createNetDnsTool,
  createNetHttpTool,
  createNetListeningPortsTool,
  createNetProbeTool,
  createNetRoutesTool,
} from './network.js';
import {
  createShellExecTool,
  createSystemdActionTool,
  createSystemdListUnitsTool,
  createSystemdStatusTool,
} from './process.js';
import {
  createMemoryGetTool,
  createMemoryNoteTool,
  createMemoryRememberTool,
  createMemorySearchTool,
  createMemorySetPreferenceTool,
} from './memory.js';
import { createToolRegistry } from './registry.js';
import type { MemoryRepository } from '../memory/repository.js';

export function createDefaultToolRegistry(options: { memory?: MemoryRepository } = {}) {
  const registry = createToolRegistry();
  registry.register(createShellExecTool());
  registry.register(createSystemdListUnitsTool());
  registry.register(createSystemdStatusTool());
  registry.register(createSystemdActionTool());
  registry.register(createFsListTool());
  registry.register(createFsReadTool());
  registry.register(createFsStatTool());
  registry.register(createFsSearchTool());
  registry.register(createFsDiskUsageTool());
  registry.register(createFsWriteTool());
  registry.register(createNetProbeTool());
  registry.register(createNetDnsTool());
  registry.register(createNetHttpTool());
  registry.register(createNetListeningPortsTool());
  registry.register(createNetRoutesTool());
  registry.register(createContainerListTool());
  registry.register(createContainerInspectTool());
  registry.register(createContainerLogsTool());
  registry.register(createContainerStatsTool());
  registry.register(createContainerActionTool());
  registry.register(createDiscoverServicesTool());
  registry.register(createDiscoverVolumesTool());
  registry.register(createDiscoverNetworkTool());
  if (options.memory) {
    registry.register(createMemorySearchTool(options.memory));
    registry.register(createMemoryGetTool(options.memory));
    registry.register(createMemoryNoteTool(options.memory));
    registry.register(createMemoryRememberTool(options.memory));
    registry.register(createMemorySetPreferenceTool(options.memory));
  }
  return registry;
}

export * from './types.js';
