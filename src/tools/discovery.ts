import { z } from 'zod';
import type { ContainerSummary } from './container.js';
import { createContainerListTool } from './container.js';
import type { ToolDefinition } from './types.js';

interface ContainerInventorySource {
  containers: ContainerSummary[];
}

interface DiscoveryOptions {
  listContainers?: () => Promise<ContainerInventorySource>;
}

const emptySchema = z.object({});

function createContainerSource(options: DiscoveryOptions): () => Promise<ContainerInventorySource> {
  if (options.listContainers) {
    return options.listContainers;
  }

  const containerList = createContainerListTool();
  return () => containerList.execute({});
}

export function createDiscoverServicesTool(options: DiscoveryOptions = {}): ToolDefinition<
  z.input<typeof emptySchema>,
  { services: { id: string; name: string; state: string; image: string; ports: string }[] }
> {
  const listContainers = createContainerSource(options);

  return {
    name: 'discover_services',
    description: 'Discover services by composing lower-level container inventory primitives.',
    schema: emptySchema,
    annotations: { readOnly: true },
    async execute() {
      const inventory = await listContainers();
      return {
        services: inventory.containers.map((container) => ({
          id: `container:${container.name}`,
          name: container.name,
          state: container.state,
          image: container.image,
          ports: container.ports,
        })),
      };
    },
  };
}

export function createDiscoverVolumesTool(options: DiscoveryOptions = {}): ToolDefinition<
  z.input<typeof emptySchema>,
  { volumes: { service: string; mount: string }[] }
> {
  const listContainers = createContainerSource(options);

  return {
    name: 'discover_volumes',
    description: 'Discover volume-related facts from known service inventory.',
    schema: emptySchema,
    annotations: { readOnly: true },
    async execute() {
      const inventory = await listContainers();
      return {
        volumes: inventory.containers.map((container) => ({
          service: container.name,
          mount: 'unknown',
        })),
      };
    },
  };
}

export function createDiscoverNetworkTool(options: DiscoveryOptions = {}): ToolDefinition<
  z.input<typeof emptySchema>,
  { ports: { service: string; ports: string }[] }
> {
  const listContainers = createContainerSource(options);

  return {
    name: 'discover_network',
    description: 'Discover network-facing facts from known service inventory.',
    schema: emptySchema,
    annotations: { readOnly: true },
    async execute() {
      const inventory = await listContainers();
      return {
        ports: inventory.containers.map((container) => ({
          service: container.name,
          ports: container.ports,
        })),
      };
    },
  };
}
