import Database from 'better-sqlite3';

const storageSchemaStatements = [
  `create table if not exists runtime_inventory_snapshots (
    id integer primary key,
    created_at text not null default (current_timestamp),
    hostname text,
    docker_version text,
    compose_version text,
    raw_summary_json text not null,
    raw_host_status_json text not null
  )`,
  `create table if not exists host_status_snapshots (
    snapshot_id integer primary key,
    hostname text not null,
    kernel text not null,
    uptime text not null,
    memory_json text not null,
    root_disk_json text not null,
    docker_server_version text not null,
    docker_compose_version text not null,
    foreign key (snapshot_id) references runtime_inventory_snapshots(id) on delete cascade
  )`,
  `create table if not exists runtime_services (
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
    restart_policy text not null default 'unknown',
    last_snapshot_id integer,
    foreign key (snapshot_id) references runtime_inventory_snapshots(id) on delete cascade,
    foreign key (last_snapshot_id) references runtime_inventory_snapshots(id) on delete set null
  )`,
  `create table if not exists runtime_service_ports (
    id integer primary key,
    runtime_service_id integer not null,
    host_port integer not null,
    container_port integer not null,
    protocol text not null,
    foreign key (runtime_service_id) references runtime_services(id) on delete cascade
  )`,
  `create table if not exists runtime_service_mounts (
    id integer primary key,
    runtime_service_id integer not null,
    host_path text not null,
    container_path text not null,
    mode text not null,
    foreign key (runtime_service_id) references runtime_services(id) on delete cascade
  )`,
  `create table if not exists runtime_service_networks (
    id integer primary key,
    runtime_service_id integer not null,
    network_name text not null,
    foreign key (runtime_service_id) references runtime_services(id) on delete cascade
  )`,
] as const;

function hasColumn(db: InstanceType<typeof Database>, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`pragma table_info('${tableName}')`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

export function applyStorageSchema(db: InstanceType<typeof Database>) {
  db.pragma('foreign_keys = on');

  for (const statement of storageSchemaStatements) {
    db.exec(statement);
  }

  if (!hasColumn(db, 'runtime_services', 'restart_policy')) {
    db.exec("alter table runtime_services add column restart_policy text not null default 'unknown'");
  }
}
