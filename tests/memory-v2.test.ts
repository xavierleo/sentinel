import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../src/memory/repository.js';
import { createMemorySetPreferenceTool } from '../src/tools/memory.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('memory v2', () => {
  it('stores configuration attributes from remembered facts', () => {
    const db = createStateDatabase(':memory:');
    const memory = createMemoryRepository(db, { now: () => 1 });

    memory.upsertEntity({ id: 'container:sonarr', kind: 'container', name: 'sonarr' });
    memory.remember({ entityId: 'container:sonarr', attribute: 'depends_on', value: 'volume:media', source: 'user' });

    expect(memory.getEntity('container:sonarr')?.attrs).toEqual({
      depends_on: 'volume:media',
    });
    db.close();
  });

  it('stores explicit preferences and includes them in preference summary', async () => {
    const db = createStateDatabase(':memory:');
    const memory = createMemoryRepository(db, { now: () => 1 });
    const tool = createMemorySetPreferenceTool(memory);

    await expect(tool.execute({ key: 'default_restart_window', value: 'after midnight' })).resolves.toEqual({
      key: 'default_restart_window',
      value: 'after midnight',
    });

    expect(memory.summarizePreferences()).toBe('User preferences:\n- default_restart_window: after midnight');
    db.close();
  });
});
