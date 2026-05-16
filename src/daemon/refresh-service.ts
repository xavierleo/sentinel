import type { PersistedSnapshotWrite } from '../storage/types.js';
import type {
  CollectHostStatus,
  CollectRuntimeInventory,
  CollectedHostStatus,
  CollectedRuntimeInventory,
} from './collectors.js';

interface RuntimeSnapshotsRepository {
  writeSnapshot(snapshot: PersistedSnapshotWrite): number;
}

export interface RefreshServiceDependencies {
  collectRuntimeInventory: CollectRuntimeInventory;
  collectHostStatus: CollectHostStatus;
  repository: RuntimeSnapshotsRepository;
  now: () => string;
}

export function createRefreshService(deps: RefreshServiceDependencies) {
  return {
    async refreshOnce(): Promise<number> {
      const runtimeInventory: CollectedRuntimeInventory = await deps.collectRuntimeInventory();
      const hostStatus: CollectedHostStatus = await deps.collectHostStatus();

      return deps.repository.writeSnapshot({
        createdAt: deps.now(),
        hostname: runtimeInventory.hostname,
        dockerVersion: runtimeInventory.dockerVersion,
        composeVersion: runtimeInventory.composeVersion,
        rawRuntimeInventory: runtimeInventory.rawRuntimeInventory,
        rawHostStatus: hostStatus.rawHostStatus,
        services: runtimeInventory.services,
        hostStatus: hostStatus.hostStatus,
      });
    },
  };
}
