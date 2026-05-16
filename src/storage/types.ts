export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface PersistedRuntimeServicePort {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

export interface PersistedRuntimeServiceMount {
  host: string;
  container: string;
  mode: string;
}

export interface PersistedRuntimeService {
  profileId: string;
  displayName: string;
  source: string;
  containerName: string;
  image: string;
  status: string;
  health: string | null;
  composeProject: string | null;
  composeService: string | null;
  stackDir: string | null;
  createdBySentinel: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  restartPolicy: string;
  ports: PersistedRuntimeServicePort[];
  mounts: PersistedRuntimeServiceMount[];
  networks: string[];
}

export interface PersistedHostStatusMemory {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  availableMb: number;
}

export interface PersistedHostStatusRootDisk {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  percentUsed: string;
  mountpoint: string;
}

export interface PersistedHostStatus {
  hostname: string;
  kernel: string;
  uptime: string;
  memory: PersistedHostStatusMemory;
  rootDisk: PersistedHostStatusRootDisk;
  dockerServerVersion: string;
  dockerComposeVersion: string;
}

export interface PersistedSnapshotWrite {
  createdAt: string;
  hostname: string | null;
  dockerVersion: string | null;
  composeVersion: string | null;
  rawRuntimeInventory: JsonValue;
  rawHostStatus: JsonValue;
  services: PersistedRuntimeService[];
  hostStatus: PersistedHostStatus;
}

export interface PersistedSnapshotRead extends PersistedSnapshotWrite {
  snapshotId: number;
}
