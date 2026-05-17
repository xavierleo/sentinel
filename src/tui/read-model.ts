import type { PersistedRuntimeService, PersistedSnapshotRead } from '../storage/types.js';
import type {
  EmptyStateView,
  FocusServiceView,
  FooterView,
  InventoryRowView,
  SnapshotFreshness,
  TuiReadModel,
  WatchtowerView,
} from './types.js';

export interface BuildTuiReadModelInput {
  snapshot: PersistedSnapshotRead | undefined;
  now: string;
  refreshIntervalMs: number;
  selectedIndex: number;
}

function formatPortsLabel(ports: PersistedRuntimeService['ports']): string {
  return ports.length === 0 ? '-' : ports.map((port) => `${port.host}:${port.container}/${port.protocol}`).join(', ');
}

function formatMountsLabel(mounts: PersistedRuntimeService['mounts']): string {
  return mounts.length === 0
    ? '-'
    : mounts.map((mount) => `${mount.host}:${mount.container}:${mount.mode}`).join(', ');
}

function computeFreshness(createdAt: string, now: string, refreshIntervalMs: number): SnapshotFreshness {
  return new Date(now).getTime() - new Date(createdAt).getTime() > refreshIntervalMs ? 'stale' : 'fresh';
}

function createEmptyState(): EmptyStateView {
  return {
    kind: 'no_snapshot',
    title: 'No stored runtime snapshot',
    body: 'Start sentinel daemon, wait for the first refresh, then press r to retry.',
  };
}

function compareServices(left: PersistedRuntimeService, right: PersistedRuntimeService): number {
  if (left.status === right.status) {
    return left.containerName.localeCompare(right.containerName);
  }

  if (left.status === 'running') {
    return -1;
  }

  if (right.status === 'running') {
    return 1;
  }

  return left.containerName.localeCompare(right.containerName);
}

function buildWatchtowerView(
  snapshot: PersistedSnapshotRead,
  freshness: SnapshotFreshness,
  runningCount: number,
  stoppedCount: number,
): WatchtowerView {
  return {
    hostname: snapshot.hostStatus.hostname,
    snapshotAgeLabel: freshness === 'stale' ? 'stale snapshot' : 'fresh snapshot',
    freshness,
    runningCount,
    stoppedCount,
    dockerVersion: snapshot.hostStatus.dockerServerVersion,
    memoryLabel: `${snapshot.hostStatus.memory.usedMb}/${snapshot.hostStatus.memory.totalMb} MB`,
    diskLabel: `${snapshot.hostStatus.rootDisk.used}/${snapshot.hostStatus.rootDisk.size} used`,
  };
}

function buildFocusServiceView(service: PersistedRuntimeService | undefined): FocusServiceView | undefined {
  if (!service) {
    return undefined;
  }

  return {
    containerName: service.containerName,
    displayName: service.displayName,
    image: service.image,
    status: service.status,
    health: service.health ?? 'unknown',
    composeProjectLabel: service.composeProject ?? '-',
    composeServiceLabel: service.composeService ?? '-',
    stackDirLabel: service.stackDir ?? '-',
    restartPolicy: service.restartPolicy,
    portsLabel: formatPortsLabel(service.ports),
    mountsLabel: formatMountsLabel(service.mounts),
    networksLabel: service.networks.length === 0 ? '-' : service.networks.join(', '),
  };
}

export function buildTuiReadModel(input: BuildTuiReadModelInput): TuiReadModel {
  if (!input.snapshot) {
    return {
      watchtower: {
        hostname: 'unknown',
        snapshotAgeLabel: 'no snapshot',
        freshness: 'stale',
        runningCount: 0,
        stoppedCount: 0,
        dockerVersion: 'unknown',
        memoryLabel: '-',
        diskLabel: '-',
      },
      inventoryRows: [],
      footer: {
        snapshotAgeLabel: 'no snapshot',
        safetyLabel: 'read-only',
        keyHints: '? help · r refresh · q quit',
      },
      emptyState: createEmptyState(),
    };
  }

  const inventoryServices = input.snapshot.services.slice().sort(compareServices);
  const selectionIndex = Math.max(0, Math.min(input.selectedIndex, inventoryServices.length - 1));
  const selectedService = inventoryServices[selectionIndex];
  const freshness = computeFreshness(input.snapshot.createdAt, input.now, input.refreshIntervalMs);
  const runningCount = inventoryServices.filter((service) => service.status === 'running').length;
  const stoppedCount = inventoryServices.length - runningCount;

  const watchtower = buildWatchtowerView(input.snapshot, freshness, runningCount, stoppedCount);
  const inventoryRows: InventoryRowView[] = inventoryServices.map((service) => ({
    containerName: service.containerName,
    displayName: service.displayName,
    status: service.status,
    health: service.health ?? 'unknown',
    portsLabel: formatPortsLabel(service.ports),
    composeProjectLabel: service.composeProject ?? '-',
  }));
  const footer: FooterView = {
    snapshotAgeLabel: watchtower.snapshotAgeLabel,
    safetyLabel: 'read-only',
    keyHints: '? help · r refresh · q quit',
  };

  return {
    watchtower,
    inventoryRows,
    focusService: buildFocusServiceView(selectedService),
    footer,
  };
}
