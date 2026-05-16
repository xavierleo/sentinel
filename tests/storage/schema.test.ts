import { describe, expect, it } from 'vitest';
import { createStateDatabase } from '../../src/storage/sqlite.js';

describe('storage schema bootstrap', () => {
  it('creates the expected state tables in sqlite', () => {
    const db = createStateDatabase(':memory:');

    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual([
      'host_status_snapshots',
      'runtime_inventory_snapshots',
      'runtime_service_mounts',
      'runtime_service_networks',
      'runtime_service_ports',
      'runtime_services',
    ]);

    db.close();
  });
});
