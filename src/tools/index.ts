import { createContainerActionTool, createContainerListTool } from './container.js';
import { createFsListTool, createFsReadTool } from './fs.js';
import { createToolRegistry } from './registry.js';

export function createDefaultToolRegistry() {
  const registry = createToolRegistry();
  registry.register(createFsListTool());
  registry.register(createFsReadTool());
  registry.register(createContainerListTool());
  registry.register(createContainerActionTool());
  return registry;
}

export * from './types.js';
