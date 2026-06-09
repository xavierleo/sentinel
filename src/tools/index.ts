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
import {
  createMemoryRemoveTool,
  createMemoryReplaceTool,
  createMemorySetTool,
  createUserProposeEditTool,
  createWorkspaceNoteTool,
  createWorkspaceProposeEditTool,
  createWorkspaceReadTool,
} from './workspace.js';
import { createSkillIndexTool, createSkillViewTool } from './skills.js';
import { createConsolidateNowTool } from './consolidation.js';
import { createToolRegistry } from './registry.js';
import type { MemoryRepository } from '../memory/repository.js';
import type { StateDatabase } from '../storage/database.js';
import type { RunConsolidationResult } from '../consolidation/reflection.js';

export function createDefaultToolRegistry(options: {
  memory?: MemoryRepository;
  workspace?: { root: string; proposalsRoot: string; db?: StateDatabase; sessionId?: string };
  consolidation?: { consolidate: (sessionId?: string) => Promise<RunConsolidationResult> };
} = {}) {
  const registry = createToolRegistry({ structuredErrors: true });
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
  if (options.workspace) {
    registry.register(createWorkspaceReadTool({ root: options.workspace.root }));
    registry.register(createMemorySetTool(options.workspace));
    registry.register(createMemoryReplaceTool(options.workspace));
    registry.register(createMemoryRemoveTool(options.workspace));
    registry.register(createUserProposeEditTool(options.workspace));
    registry.register(createWorkspaceProposeEditTool(options.workspace));
    registry.register(createWorkspaceNoteTool({ root: options.workspace.root }));
    registry.register(createSkillIndexTool({ root: options.workspace.root }));
    registry.register(createSkillViewTool({ root: options.workspace.root }));
  }
  if (options.consolidation) {
    registry.register(createConsolidateNowTool(options.consolidation));
  }
  return registry;
}

export * from './types.js';
