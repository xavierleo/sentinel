import React, { useEffect, useMemo, useRef, useState } from 'react';
import { render, useApp, useInput } from 'ink';
import type { PersistedSnapshotRead } from '../storage/types.js';
import { defaultConfig } from '../config/defaults.js';
import { createDockerContainerLogsTool } from '../tools/containers.js';
import { SentinelTuiApp } from './app.js';
import { reduceKeyPress } from './keyboard.js';
import { buildLogPreview, type LogPreviewView } from './log-preview.js';
import { createSnapshotPoller, type SnapshotPoller } from './poller.js';
import { buildTuiReadModel } from './read-model.js';
import { createSnapshotStateReader, type SnapshotStateReader } from './state-reader.js';
import type { TuiReadModel } from './types.js';

const LOG_PREVIEW_LINES = 5;
const SNAPSHOT_POLL_INTERVAL_MS = 2_000;

interface SentinelTuiRuntimeProps {
  initialSnapshot: PersistedSnapshotRead | undefined;
  pollIntervalMs: number;
  previewLines: number;
  reader: SnapshotStateReader;
  refreshIntervalMs: number;
  readLogs: (containerName: string, lines: number) => Promise<string>;
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Invalid refresh interval: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return amount * unitMs;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeLogLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function attachLogPreview(model: TuiReadModel, logPreview: LogPreviewView | undefined): TuiReadModel {
  if (!model.focusService || !logPreview || logPreview.containerName !== model.focusService.containerName) {
    return model;
  }

  return {
    ...model,
    focusService: {
      ...model.focusService,
      logPreview,
    },
  };
}

function applyReadError(model: TuiReadModel, readError: string | undefined): TuiReadModel {
  if (!readError || !model.emptyState) {
    return model;
  }

  return {
    ...model,
    emptyState: {
      kind: 'read_error',
      title: 'Unable to read runtime snapshot',
      body: readError,
    },
    footer: {
      ...model.footer,
      snapshotAgeLabel: 'read failed',
    },
  };
}

function SentinelTuiRuntime({
  initialSnapshot,
  pollIntervalMs,
  previewLines,
  reader,
  refreshIntervalMs,
  readLogs,
}: SentinelTuiRuntimeProps): React.JSX.Element {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [readError, setReadError] = useState<string | undefined>();
  const [logPreview, setLogPreview] = useState<LogPreviewView | undefined>();
  const [logRefreshTick, setLogRefreshTick] = useState(0);
  const pollerRef = useRef<SnapshotPoller | undefined>(undefined);
  const snapshotRef = useRef(initialSnapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const poller = createSnapshotPoller({
      readLatestSnapshot: () => {
        try {
          const nextSnapshot = reader.readLatestSnapshot();
          snapshotRef.current = nextSnapshot;
          setReadError(undefined);
          return nextSnapshot;
        } catch (error) {
          setReadError(getErrorMessage(error));
          return snapshotRef.current;
        }
      },
      intervalMs: pollIntervalMs,
      onSnapshot: (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setNow(new Date().toISOString());
        setLogRefreshTick((value) => value + 1);
      },
    });

    pollerRef.current = poller;
    poller.start();

    return () => {
      poller.stop();
      pollerRef.current = undefined;
    };
  }, [pollIntervalMs, reader]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date().toISOString());
    }, pollIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [pollIntervalMs]);

  const model = useMemo(
    () =>
      buildTuiReadModel({
        snapshot,
        now,
        refreshIntervalMs,
        selectedIndex,
      }),
    [now, refreshIntervalMs, selectedIndex, snapshot],
  );

  useEffect(() => {
    const containerName = model.focusService?.containerName;
    if (!containerName) {
      setLogPreview(undefined);
      return;
    }

    let cancelled = false;

    setLogPreview(
      buildLogPreview({
        containerName,
        title: `Recent logs for ${containerName}`,
        body: [],
        maxLines: previewLines,
        unavailableMessage: 'Loading recent logs...',
      }),
    );

    void readLogs(containerName, previewLines)
      .then((stdout) => {
        if (cancelled) {
          return;
        }

        setLogPreview(
          buildLogPreview({
            containerName,
            title: `Recent logs for ${containerName}`,
            body: normalizeLogLines(stdout),
            maxLines: previewLines,
          }),
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setLogPreview(
          buildLogPreview({
            containerName,
            title: `Recent logs for ${containerName}`,
            body: [],
            maxLines: previewLines,
            unavailableMessage: `Log preview unavailable: ${getErrorMessage(error)}`,
          }),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [logRefreshTick, model.focusService?.containerName, previewLines, readLogs]);

  const viewModel = useMemo(
    () => applyReadError(attachLogPreview(model, logPreview), readError),
    [logPreview, model, readError],
  );

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    const normalizedInput = key.upArrow ? '\u001B[A' : key.downArrow ? '\u001B[B' : input;
    const nextState = reduceKeyPress(
      {
        selectedIndex: viewModel.selectedInventoryIndex ?? 0,
        helpOpen,
      },
      normalizedInput,
      viewModel.inventoryRows.length,
    );

    setSelectedIndex(nextState.selectedIndex);
    setHelpOpen(nextState.helpOpen);

    if (nextState.shouldRefresh) {
      setNow(new Date().toISOString());
      setLogRefreshTick((value) => value + 1);
      pollerRef.current?.refreshNow();
    }

    if (nextState.shouldQuit) {
      exit();
    }
  });

  return <SentinelTuiApp model={viewModel} helpOpen={helpOpen} />;
}

export async function runTuiApp(): Promise<void> {
  const reader = createSnapshotStateReader();
  const readLogs = createDockerContainerLogsTool({ defaultTailLines: LOG_PREVIEW_LINES });
  const refreshIntervalMs = parseDurationMs(defaultConfig.runtime_inventory.refresh_interval);
  const initialSnapshot = reader.readLatestSnapshot();
  const app = render(
    <SentinelTuiRuntime
      initialSnapshot={initialSnapshot}
      pollIntervalMs={SNAPSHOT_POLL_INTERVAL_MS}
      previewLines={LOG_PREVIEW_LINES}
      reader={reader}
      refreshIntervalMs={refreshIntervalMs}
      readLogs={readLogs}
    />,
  );

  try {
    await app.waitUntilExit();
  } finally {
    app.unmount();
  }
}
