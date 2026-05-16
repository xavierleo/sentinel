import type { JsonValue, PersistedHostStatus, PersistedRuntimeService } from '../storage/types.js';

export interface CollectedRuntimeInventory {
  hostname: string | null;
  dockerVersion: string | null;
  composeVersion: string | null;
  rawRuntimeInventory: JsonValue;
  services: PersistedRuntimeService[];
}

export interface CollectedHostStatus {
  rawHostStatus: JsonValue;
  hostStatus: PersistedHostStatus;
}

export type CollectRuntimeInventory = () => Promise<CollectedRuntimeInventory>;
export type CollectHostStatus = () => Promise<CollectedHostStatus>;
