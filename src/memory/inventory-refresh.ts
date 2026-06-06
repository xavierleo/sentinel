import type { ContainerSummary } from '../tools/container.js';
import type { MemoryRepository } from './repository.js';

export interface ContainerInventorySource {
  containers: ContainerSummary[];
}

export async function refreshContainerInventory(options: {
  memory: MemoryRepository;
  listContainers: () => Promise<ContainerInventorySource>;
  now?: () => number;
}): Promise<{ containers: number }> {
  const observedAt = options.now ? options.now() : Date.now();
  const inventory = await options.listContainers();

  for (const container of inventory.containers) {
    const entityId = `container:${container.name}`;
    options.memory.upsertEntity({ id: entityId, kind: 'container', name: container.name }, observedAt);
    options.memory.setEntityAttr(entityId, 'container_id', container.id, 'container_list', observedAt);
    options.memory.setEntityAttr(entityId, 'image', container.image, 'container_list', observedAt);
    options.memory.setEntityAttr(entityId, 'state', container.state, 'container_list', observedAt);
    options.memory.setEntityAttr(entityId, 'status', container.status, 'container_list', observedAt);
    options.memory.setEntityAttr(entityId, 'ports', container.ports, 'container_list', observedAt);
  }

  return { containers: inventory.containers.length };
}
