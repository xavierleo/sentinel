import type { JsonValue } from '../storage/types.js';

export interface CollectedRuntimeServicePort {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

export interface CollectedRuntimeServiceMount {
  host: string;
  container: string;
  mode: string;
}

export interface CollectedRuntimeService {
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
  ports: CollectedRuntimeServicePort[];
  mounts: CollectedRuntimeServiceMount[];
  networks: string[];
}

export interface CollectedHostStatusMemory {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  availableMb: number;
}

export interface CollectedHostStatusRootDisk {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  percentUsed: string;
  mountpoint: string;
}

export interface CollectedHostStatusSnapshot {
  hostname: string;
  kernel: string;
  uptime: string;
  memory: CollectedHostStatusMemory;
  rootDisk: CollectedHostStatusRootDisk;
  dockerServerVersion: string;
  dockerComposeVersion: string;
}

export interface CollectedRuntimeInventory {
  hostname: string | null;
  dockerVersion: string | null;
  composeVersion: string | null;
  rawRuntimeInventory: JsonValue;
  services: CollectedRuntimeService[];
}

export interface CollectedHostStatus {
  rawHostStatus: JsonValue;
  hostStatus: CollectedHostStatusSnapshot;
}

export type CollectRuntimeInventory = () => Promise<CollectedRuntimeInventory>;
export type CollectHostStatus = () => Promise<CollectedHostStatus>;
