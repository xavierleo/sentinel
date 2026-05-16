import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyStorageSchema } from '../../src/storage/schema.js';
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
        'restart_policy',
        'last_snapshot_id',
      ]),
    );

    db.close();
  });

  it('upgrades legacy runtime_services rows to include restart_policy with a durable unknown default', () => {
    const db = new Database(':memory:');

    db.exec(`create table runtime_inventory_snapshots (
      id integer primary key,
      created_at text not null,
      hostname text,
      docker_version text,
      compose_version text,
      raw_summary_json text not null,
      raw_host_status_json text not null
    )`);
    db.exec(`create table runtime_services (
      id integer primary key,
      snapshot_id integer not null,
      profile_id text not null,
      display_name text not null,
      source text not null,
      container_name text not null,
      image text not null,
      status text not null,
      health text,
      compose_project text,
      compose_service text,
      stack_dir text,
      created_by_sentinel integer not null default 0,
      first_seen_at text not null,
      last_seen_at text not null,
      last_snapshot_id integer
    )`);
    db.prepare(
      `insert into runtime_services (
        snapshot_id,
        profile_id,
        display_name,
        source,
        container_name,
        image,
        status,
        health,
        compose_project,
        compose_service,
        stack_dir,
        created_by_sentinel,
        first_seen_at,
        last_seen_at,
        last_snapshot_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      'sonarr',
      'Sonarr',
      'runtime_discovery',
      'sonarr',
      'lscr.io/linuxserver/sonarr:latest',
      'running',
      'healthy',
      'media',
      'sonarr',
      '/opt/stacks/media',
      0,
      '2026-05-01T00:00:00.000Z',
      '2026-05-02T00:00:00.000Z',
      null,
    );

    applyStorageSchema(db);

    const restartPolicyColumn = db
      .prepare("pragma table_info('runtime_services')")
      .all() as Array<{ name: string; notnull: number; dflt_value: string | null }>;
    expect(restartPolicyColumn).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'restart_policy',
          notnull: 1,
          dflt_value: "'unknown'",
        }),
      ]),
    );

    const row = db
      .prepare("select restart_policy from runtime_services where profile_id = 'sonarr'")
      .get() as { restart_policy: string };
    expect(row.restart_policy).toBe('unknown');

    db.close();
  });

  it('normalizes nullable legacy restart_policy values to unknown during schema upgrade', () => {
    const db = new Database(':memory:');

    db.exec(`create table runtime_inventory_snapshots (
      id integer primary key,
      created_at text not null,
      hostname text,
      docker_version text,
      compose_version text,
      raw_summary_json text not null,
      raw_host_status_json text not null
    )`);
    db.exec(`create table runtime_services (
      id integer primary key,
      snapshot_id integer not null,
      profile_id text not null,
      display_name text not null,
      source text not null,
      container_name text not null,
      image text not null,
      status text not null,
      health text,
      compose_project text,
      compose_service text,
      stack_dir text,
      created_by_sentinel integer not null default 0,
      first_seen_at text not null,
      last_seen_at text not null,
      restart_policy text,
      last_snapshot_id integer
    )`);
    db.prepare(
      `insert into runtime_services (
        snapshot_id,
        profile_id,
        display_name,
        source,
        container_name,
        image,
        status,
        health,
        compose_project,
        compose_service,
        stack_dir,
        created_by_sentinel,
        first_seen_at,
        last_seen_at,
        restart_policy,
        last_snapshot_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      'radarr',
      'Radarr',
      'runtime_discovery',
      'radarr',
      'lscr.io/linuxserver/radarr:latest',
      'running',
      'healthy',
      'media',
      'radarr',
      '/opt/stacks/media',
      0,
      '2026-05-03T00:00:00.000Z',
      '2026-05-04T00:00:00.000Z',
      null,
      null,
    );

    applyStorageSchema(db);

    const row = db
      .prepare("select restart_policy from runtime_services where profile_id = 'radarr'")
      .get() as { restart_policy: string | null };
    expect(row.restart_policy).toBe('unknown');

    db.close();
  });
});
