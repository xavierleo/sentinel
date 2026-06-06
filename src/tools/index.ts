import { createContainerActionTool, createContainerListTool } from './container.js';
import { createFsListTool, createFsReadTool } from './fs.js';
import { createMemoryGetTool, createMemoryNoteTool, createMemorySearchTool } from './memory.js';
import { createToolRegistry } from './registry.js';
import type { MemoryRepository } from '../memory/repository.js';

export function createDefaultToolRegistry(options: { memory?: MemoryRepository } = {}) {
  const registry = createToolRegistry();
  registry.register(createFsListTool());
  registry.register(createFsReadTool());
  registry.register(createContainerListTool());
  registry.register(createContainerActionTool());
  if (options.memory) {
    registry.register(createMemorySearchTool(options.memory));
    registry.register(createMemoryGetTool(options.memory));
    registry.register(createMemoryNoteTool(options.memory));
  }
  return registry;
}

export * from './types.js';
