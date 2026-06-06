import { describe, expect, it } from 'vitest';
import { createDiscoverNetworkTool, createDiscoverServicesTool, createDiscoverVolumesTool } from '../src/tools/discovery.js';

describe('discovery composite tools', () => {
  it('discovers services through lower-level container inventory', async () => {
    const tool = createDiscoverServicesTool({
      listContainers: async () => ({
        containers: [{ id: 'abc', name: 'sonarr', image: 'sonarr:latest', state: 'running', status: 'Up', ports: '8989/tcp' }],
      }),
    });

    await expect(tool.execute({})).resolves.toEqual({
      services: [{ id: 'container:sonarr', name: 'sonarr', state: 'running', image: 'sonarr:latest', ports: '8989/tcp' }],
    });
  });

  it('discovers volumes and network facts from container details', async () => {
    const containers = [{ id: 'abc', name: 'sonarr', image: 'sonarr:latest', state: 'running', status: 'Up', ports: '8989/tcp' }];

    await expect(createDiscoverVolumesTool({ listContainers: async () => ({ containers }) }).execute({})).resolves.toEqual({
      volumes: [{ service: 'sonarr', mount: 'unknown' }],
    });
    await expect(createDiscoverNetworkTool({ listContainers: async () => ({ containers }) }).execute({})).resolves.toEqual({
      ports: [{ service: 'sonarr', ports: '8989/tcp' }],
    });
  });
});
