import { describe, expect, it } from 'vitest';
import { refreshContainerInventory } from '../src/memory/inventory-refresh.js';
import { createMemoryRepository } from '../src/memory/repository.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('inventory refresh', () => {
  it('writes container_list results into inventory memory', async () => {
    const db = createStateDatabase(':memory:');
    const memory = createMemoryRepository(db, { now: () => 1_717_000_000_000 });

    await refreshContainerInventory({
      memory,
      listContainers: async () => ({
        containers: [
          {
            id: 'abc123',
            name: 'sonarr',
            image: 'lscr.io/linuxserver/sonarr:latest',
            state: 'running',
            status: 'Up 10 minutes',
            ports: '0.0.0.0:8989->8989/tcp',
          },
        ],
      }),
      now: () => 1_717_000_000_000,
    });

    expect(memory.getEntity('container:sonarr')).toEqual(
      expect.objectContaining({
        id: 'container:sonarr',
        kind: 'container',
        name: 'sonarr',
        attrs: expect.objectContaining({
          image: 'lscr.io/linuxserver/sonarr:latest',
          state: 'running',
          status: 'Up 10 minutes',
          ports: '0.0.0.0:8989->8989/tcp',
        }),
      }),
    );
    db.close();
  });
});
