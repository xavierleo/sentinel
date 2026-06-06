import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../src/memory/repository.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('memory repository', () => {
  it('persists inventory entities with first and last seen timestamps', () => {
    const db = createStateDatabase(':memory:');
    const memory = createMemoryRepository(db, { now: () => 1_717_000_000_000 });

    memory.upsertEntity({ id: 'container:sonarr', kind: 'container', name: 'sonarr' });
    memory.upsertEntity({ id: 'container:sonarr', kind: 'container', name: 'sonarr' }, 1_717_000_060_000);

    expect(memory.getEntity('container:sonarr')).toEqual({
      id: 'container:sonarr',
      kind: 'container',
      name: 'sonarr',
      firstSeenAt: 1_717_000_000_000,
      lastSeenAt: 1_717_000_060_000,
      archivedAt: null,
      attrs: {},
      notes: [],
    });
    db.close();
  });

  it('stores notes and returns text search hits across entities and notes', () => {
    const db = createStateDatabase(':memory:');
    const memory = createMemoryRepository(db, { now: () => 1 });

    memory.upsertEntity({ id: 'container:sonarr', kind: 'container', name: 'sonarr' });
    memory.addNote({ body: 'Sonarr depends on the media volume', tags: ['media'], entityId: 'container:sonarr' });

    expect(memory.search({ query: 'media', kinds: ['inventory', 'notes'], limit: 10 })).toEqual([
      expect.objectContaining({ kind: 'inventory', entityId: 'container:sonarr', title: 'container sonarr' }),
      expect.objectContaining({ kind: 'notes', entityId: 'container:sonarr', title: 'note media' }),
    ]);
    db.close();
  });
});
