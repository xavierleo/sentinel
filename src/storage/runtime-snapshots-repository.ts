import Database from 'better-sqlite3';
import type {
  JsonValue,
  PersistedHostStatus,
  PersistedRuntimeService,
  PersistedSnapshotRead,
  PersistedSnapshotWrite,
} from './types.js';

type SqliteDatabase = InstanceType<typeof Database>;

interface RuntimeInventorySnapshotRow {
  id: number;
  created_at: string;
  hostname: string | null;
  docker_version: string | null;
  compose_version: string | null;
  raw_summary_json: string;
  raw_host_status_json: string;
}

interface HostStatusSnapshotRow {
  snapshot_id: number;
  hostname: string;
  kernel: string;
  uptime: string;
  memory_json: string;
  root_disk_json: string;
  docker_server_version: string;
  docker_compose_version: string;
}

interface RuntimeServiceRow {
  id: number;
  snapshot_id: number;
  profile_id: string;
  display_name: string;
  source: string;
  container_name: string;
  image: string;
  status: string;
  health: string | null;
  compose_project: string | null;
  compose_service: string | null;
  stack_dir: string | null;
  created_by_sentinel: number;
  first_seen_at: string;
  last_seen_at: string;
  restart_policy: string;
  last_snapshot_id: number | null;
}

interface RuntimeServicePortRow {
  host_port: number;
  container_port: number;
  protocol: 'tcp' | 'udp';
}

interface RuntimeServiceMountRow {
  host_path: string;
  container_path: string;
  mode: string;
}

interface RuntimeServiceNetworkRow {
  network_name: string;
}

export interface RuntimeSnapshotsRepository {
  writeSnapshot: (snapshot: PersistedSnapshotWrite) => number;
  readLatestSnapshot: () => PersistedSnapshotRead | undefined;
  readPreviousSnapshot: () => PersistedSnapshotRead | undefined;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function readHostStatus(row: HostStatusSnapshotRow): PersistedHostStatus {
  return {
    hostname: row.hostname,
    kernel: row.kernel,
    uptime: row.uptime,
    memory: parseJson(row.memory_json),
    rootDisk: parseJson(row.root_disk_json),
    dockerServerVersion: row.docker_server_version,
    dockerComposeVersion: row.docker_compose_version,
  };
}

function readServices(
  db: SqliteDatabase,
  snapshotId: number,
): PersistedRuntimeService[] {
  const serviceRows = db
    .prepare(
      `select
        id,
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
       from runtime_services
       where snapshot_id = ?
       order by id asc`,
    )
    .all(snapshotId) as RuntimeServiceRow[];

  const readPorts = db.prepare(
    `select host_port, container_port, protocol
     from runtime_service_ports
     where runtime_service_id = ?
     order by id asc`,
  );
  const readMounts = db.prepare(
    `select host_path, container_path, mode
     from runtime_service_mounts
     where runtime_service_id = ?
     order by id asc`,
  );
  const readNetworks = db.prepare(
    `select network_name
     from runtime_service_networks
     where runtime_service_id = ?
     order by id asc`,
  );

  return serviceRows.map((row) => ({
    profileId: row.profile_id,
    displayName: row.display_name,
    source: row.source,
    containerName: row.container_name,
    image: row.image,
    status: row.status,
    health: row.health,
    composeProject: row.compose_project,
    composeService: row.compose_service,
    stackDir: row.stack_dir,
    createdBySentinel: row.created_by_sentinel === 1,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    restartPolicy: row.restart_policy,
    ports: (readPorts.all(row.id) as RuntimeServicePortRow[]).map((port) => ({
      host: port.host_port,
      container: port.container_port,
      protocol: port.protocol,
    })),
    mounts: (readMounts.all(row.id) as RuntimeServiceMountRow[]).map((mount) => ({
      host: mount.host_path,
      container: mount.container_path,
      mode: mount.mode,
    })),
    networks: (readNetworks.all(row.id) as RuntimeServiceNetworkRow[]).map((network) => network.network_name),
  }));
}

function loadSnapshot(db: SqliteDatabase, snapshotId: number): PersistedSnapshotRead | undefined {
  const snapshotRow = db
    .prepare(
      `select id, created_at, hostname, docker_version, compose_version, raw_summary_json, raw_host_status_json
       from runtime_inventory_snapshots
       where id = ?`,
    )
    .get(snapshotId) as RuntimeInventorySnapshotRow | undefined;

  if (!snapshotRow) {
    return undefined;
  }

  const hostStatusRow = db
    .prepare(
      `select snapshot_id, hostname, kernel, uptime, memory_json, root_disk_json, docker_server_version, docker_compose_version
       from host_status_snapshots
       where snapshot_id = ?`,
    )
    .get(snapshotId) as HostStatusSnapshotRow | undefined;

  if (!hostStatusRow) {
    return undefined;
  }

  return {
    snapshotId: snapshotRow.id,
    createdAt: snapshotRow.created_at,
    hostname: snapshotRow.hostname,
    dockerVersion: snapshotRow.docker_version,
    composeVersion: snapshotRow.compose_version,
    rawRuntimeInventory: parseJson<JsonValue>(snapshotRow.raw_summary_json),
    rawHostStatus: parseJson<JsonValue>(snapshotRow.raw_host_status_json),
    services: readServices(db, snapshotRow.id),
    hostStatus: readHostStatus(hostStatusRow),
  };
}

export function createRuntimeSnapshotsRepository(db: SqliteDatabase): RuntimeSnapshotsRepository {
  const writeSnapshot = db.transaction((snapshot: PersistedSnapshotWrite) => {
    const snapshotResult = db
      .prepare(
        `insert into runtime_inventory_snapshots (
          created_at,
          hostname,
          docker_version,
          compose_version,
          raw_summary_json,
          raw_host_status_json
        ) values (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.createdAt,
        snapshot.hostname,
        snapshot.dockerVersion,
        snapshot.composeVersion,
        stringifyJson(snapshot.rawRuntimeInventory),
        stringifyJson(snapshot.rawHostStatus),
      );

    const snapshotId = Number(snapshotResult.lastInsertRowid);

    db.prepare(
      `insert into host_status_snapshots (
        snapshot_id,
        hostname,
        kernel,
        uptime,
        memory_json,
        root_disk_json,
        docker_server_version,
        docker_compose_version
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshotId,
      snapshot.hostStatus.hostname,
      snapshot.hostStatus.kernel,
      snapshot.hostStatus.uptime,
      stringifyJson(snapshot.hostStatus.memory),
      stringifyJson(snapshot.hostStatus.rootDisk),
      snapshot.hostStatus.dockerServerVersion,
      snapshot.hostStatus.dockerComposeVersion,
    );

    const insertService = db.prepare(
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
    );

    const insertPort = db.prepare(
      `insert into runtime_service_ports (
        runtime_service_id,
        host_port,
        container_port,
        protocol
      ) values (?, ?, ?, ?)`,
    );
    const insertMount = db.prepare(
      `insert into runtime_service_mounts (
        runtime_service_id,
        host_path,
        container_path,
        mode
      ) values (?, ?, ?, ?)`,
    );
    const insertNetwork = db.prepare(
      `insert into runtime_service_networks (
        runtime_service_id,
        network_name
      ) values (?, ?)`,
    );

    for (const service of snapshot.services) {
      const serviceResult = insertService.run(
        snapshotId,
        service.profileId,
        service.displayName,
        service.source,
        service.containerName,
        service.image,
        service.status,
        service.health,
        service.composeProject,
        service.composeService,
        service.stackDir,
        service.createdBySentinel ? 1 : 0,
        service.firstSeenAt,
        service.lastSeenAt,
        service.restartPolicy,
        snapshotId,
      );

      const serviceId = Number(serviceResult.lastInsertRowid);

      for (const port of service.ports) {
        insertPort.run(serviceId, port.host, port.container, port.protocol);
      }

      for (const mount of service.mounts) {
        insertMount.run(serviceId, mount.host, mount.container, mount.mode);
      }

      for (const network of service.networks) {
        insertNetwork.run(serviceId, network);
      }
    }

    return snapshotId;
  });

  return {
    writeSnapshot,
    readLatestSnapshot(): PersistedSnapshotRead | undefined {
      const row = db
        .prepare('select id from runtime_inventory_snapshots order by id desc limit 1')
        .get() as { id: number } | undefined;

      return row ? loadSnapshot(db, row.id) : undefined;
    },
    readPreviousSnapshot(): PersistedSnapshotRead | undefined {
      const row = db
        .prepare('select id from runtime_inventory_snapshots order by id desc limit 1 offset 1')
        .get() as { id: number } | undefined;

      return row ? loadSnapshot(db, row.id) : undefined;
    },
  };
}
