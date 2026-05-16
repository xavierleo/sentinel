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

    const inventoryColumns = db
      .prepare("pragma table_info('runtime_inventory_snapshots')")
      .all() as Array<{ name: string }>;
    expect(inventoryColumns.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'created_at',
        'hostname',
        'docker_version',
        'compose_version',
        'raw_summary_json',
        'raw_host_status_json',
      ]),
    );

    const serviceColumns = db
      .prepare("pragma table_info('runtime_services')")
      .all() as Array<{ name: string }>;
    expect(serviceColumns.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'snapshot_id',
        'profile_id',
        'display_name',
        'source',
        'container_name',
        'image',
        'status',
        'health',
        'compose_project',
        'compose_service',
        'stack_dir',
        'created_by_sentinel',
        'first_seen_at',
        'last_seen_at',
        'last_snapshot_id',
      ]),
    );

    db.close();
  });
});
