import type { PersistedSnapshotWrite } from '../storage/types.js';
import type {
  CollectHostStatus,
  CollectRuntimeInventory,
  CollectedHostStatusSnapshot,
  CollectedRuntimeService,
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

function mapCollectedService(service: CollectedRuntimeService): PersistedSnapshotWrite['services'][number] {
  return {
    profileId: service.profileId,
    displayName: service.displayName,
    source: service.source,
    containerName: service.containerName,
    image: service.image,
    status: service.status,
    health: service.health,
    composeProject: service.composeProject,
    composeService: service.composeService,
    stackDir: service.stackDir,
    createdBySentinel: service.createdBySentinel,
    firstSeenAt: service.firstSeenAt,
    lastSeenAt: service.lastSeenAt,
    restartPolicy: service.restartPolicy,
    ports: service.ports,
    mounts: service.mounts,
    networks: service.networks,
  };
}

function mapCollectedHostStatus(hostStatus: CollectedHostStatusSnapshot): PersistedSnapshotWrite['hostStatus'] {
  return {
    hostname: hostStatus.hostname,
    kernel: hostStatus.kernel,
    uptime: hostStatus.uptime,
    memory: hostStatus.memory,
    rootDisk: hostStatus.rootDisk,
    dockerServerVersion: hostStatus.dockerServerVersion,
    dockerComposeVersion: hostStatus.dockerComposeVersion,
  };
}

export function createRefreshService(deps: RefreshServiceDependencies) {
  return {
    async refreshOnce(): Promise<number> {
      const [runtimeInventory, hostStatus] = await Promise.all([
        deps.collectRuntimeInventory(),
        deps.collectHostStatus(),
      ]);

      return deps.repository.writeSnapshot({
        createdAt: deps.now(),
        hostname: runtimeInventory.hostname,
        dockerVersion: runtimeInventory.dockerVersion,
        composeVersion: runtimeInventory.composeVersion,
        rawRuntimeInventory: runtimeInventory.rawRuntimeInventory,
        rawHostStatus: hostStatus.rawHostStatus,
        services: runtimeInventory.services.map(mapCollectedService),
        hostStatus: mapCollectedHostStatus(hostStatus.hostStatus),
      });
    },
  };
}
