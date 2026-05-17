import type { LogPreviewView } from './log-preview.js';

export type SnapshotFreshness = 'fresh' | 'stale';

export interface WatchtowerView {
  hostname: string;
  snapshotAgeLabel: string;
  freshness: SnapshotFreshness;
  runningCount: number;
  stoppedCount: number;
  dockerVersion: string;
  memoryLabel: string;
  diskLabel: string;
}

export interface InventoryRowView {
  containerName: string;
  displayName: string;
  status: string;
  health: string;
  portsLabel: string;
  composeProjectLabel: string;
}

export interface FocusServiceView {
  containerName: string;
  displayName: string;
  image: string;
  status: string;
  health: string;
  composeProjectLabel: string;
  composeServiceLabel: string;
  stackDirLabel: string;
  restartPolicy: string;
  portsLabel: string;
  mountsLabel: string;
  networksLabel: string;
  logPreview?: LogPreviewView;
}

export interface FooterView {
  snapshotAgeLabel: string;
  safetyLabel: string;
  keyHints: string;
}

export interface EmptyStateView {
  kind: 'no_snapshot' | 'read_error';
  title: string;
  body: string;
}

export interface TuiReadModel {
  watchtower: WatchtowerView;
  inventoryRows: InventoryRowView[];
  selectedInventoryIndex?: number;
  focusService?: FocusServiceView;
  footer: FooterView;
  emptyState?: EmptyStateView;
}
