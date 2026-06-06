import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../src/memory/repository.js';
import { createMemoryGetTool, createMemoryNoteTool, createMemorySearchTool } from '../src/tools/memory.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('memory tools', () => {
  it('searches, reads, and writes memory through tools', async () => {
    const db = createStateDatabase(':memory:');
    const memory = createMemoryRepository(db, { now: () => 1 });
    memory.upsertEntity({ id: 'container:sonarr', kind: 'container', name: 'sonarr' });

    await expect(createMemoryNoteTool(memory).execute({ body: 'Sonarr is part of media automation', tags: ['media'], entity: 'container:sonarr' })).resolves.toEqual({
      id: 1,
    });
    await expect(createMemorySearchTool(memory).execute({ query: 'media', kinds: ['notes'], limit: 5 })).resolves.toEqual({
      results: [expect.objectContaining({ kind: 'notes', entityId: 'container:sonarr' })],
    });
    await expect(createMemoryGetTool(memory).execute({ entity_id: 'container:sonarr' })).resolves.toEqual({
      entity: expect.objectContaining({
        id: 'container:sonarr',
        notes: [expect.objectContaining({ body: 'Sonarr is part of media automation' })],
      }),
    });
    db.close();
  });
});
