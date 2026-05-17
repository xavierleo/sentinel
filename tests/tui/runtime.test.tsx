import React from 'react';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, type Instance } from 'ink';
import type { PersistedSnapshotRead } from '../../src/storage/types.js';
import { SentinelTuiRuntime } from '../../src/tui/index.js';
import type { SnapshotStateReader } from '../../src/tui/state-reader.js';

vi.mock('../../src/tui/poller.js', () => ({
  createSnapshotPoller: () => ({
    start() {},
    refreshNow() {},
    stop() {},
  }),
}));

interface ReadLogsCall {
  containerName: string;
  lines: number;
  signal: AbortSignal | undefined;
}

const baseSnapshot: PersistedSnapshotRead = {
  snapshotId: 1,
  createdAt: '2026-05-17T10:00:00.000Z',
  hostname: 'cerebro',
  dockerVersion: '29.4.3',
  composeVersion: '2.35.1',
  rawRuntimeInventory: {},
  rawHostStatus: {},
  services: [
    {
      profileId: 'sonarr',
      displayName: 'Sonarr',
      source: 'docker',
      containerName: 'sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      status: 'running',
      health: 'healthy',
      composeProject: 'media',
      composeService: 'sonarr',
      stackDir: '/opt/stacks/media',
      createdBySentinel: false,
      firstSeenAt: '2026-05-17T09:00:00.000Z',
      lastSeenAt: '2026-05-17T10:00:00.000Z',
      restartPolicy: 'unless-stopped',
      ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
      mounts: [],
      networks: ['media'],
    },
    {
      profileId: 'radarr',
      displayName: 'Radarr',
      source: 'docker',
      containerName: 'radarr',
      image: 'lscr.io/linuxserver/radarr:latest',
      status: 'exited',
      health: null,
      composeProject: 'media',
      composeService: 'radarr',
      stackDir: '/opt/stacks/media',
      createdBySentinel: false,
      firstSeenAt: '2026-05-17T09:00:00.000Z',
      lastSeenAt: '2026-05-17T10:00:00.000Z',
      restartPolicy: 'unless-stopped',
      ports: [{ host: 7878, container: 7878, protocol: 'tcp' }],
      mounts: [],
      networks: ['media'],
    },
  ],
  hostStatus: {
    hostname: 'cerebro',
    kernel: '6.8.0',
    uptime: '1 day',
    memory: {
      totalMb: 16000,
      usedMb: 8000,
      freeMb: 4000,
      availableMb: 7000,
    },
    rootDisk: {
      filesystem: '/dev/disk3s1',
      size: '915G',
      used: '110G',
      available: '805G',
      percentUsed: '12%',
      mountpoint: '/',
    },
    dockerServerVersion: '29.4.3',
    dockerComposeVersion: '2.35.1',
  },
};

const reader: SnapshotStateReader = {
  readLatestSnapshot: () => baseSnapshot,
};

const activeInstances: Instance[] = [];

function createStdin(): NodeJS.ReadStream {
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream & {
    isTTY?: boolean;
    setRawMode?: (value: boolean) => typeof stdin;
    ref?: () => typeof stdin;
    unref?: () => typeof stdin;
  };
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  return stdin;
}

function flushEffects(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderRuntime(readLogs: (containerName: string, lines: number, options?: { signal?: AbortSignal }) => Promise<string>) {
  const stdout = new PassThrough();
  const stdin = createStdin();
  const instance = render(
    <SentinelTuiRuntime
      initialSnapshot={baseSnapshot}
      pollIntervalMs={60_000}
      previewLines={5}
      reader={reader}
      refreshIntervalMs={60_000}
      readLogs={readLogs}
    />,
    {
      stdin,
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );

  activeInstances.push(instance);
  await flushEffects();

  return {
    instance,
    stdin,
  };
}

afterEach(() => {
  for (const instance of activeInstances.splice(0)) {
    instance.unmount();
  }
});

describe('sentinel tui runtime log preview cancellation', () => {
  it('aborts the previous log read when focus changes', async () => {
    const calls: ReadLogsCall[] = [];
    const readLogs = vi.fn(async (containerName: string, lines: number, options?: { signal?: AbortSignal }) => {
      calls.push({ containerName, lines, signal: options?.signal });
      return new Promise<string>((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason ?? new Error('aborted')),
          { once: true },
        );
      });
    });

    const { stdin } = await renderRuntime(readLogs);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.containerName).toBe('sonarr');
    expect(calls[0]?.signal?.aborted).toBe(false);

    stdin.write('j');
    await flushEffects();

    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(calls[1]?.containerName).toBe('radarr');
    expect(calls[1]?.signal?.aborted).toBe(false);
  });

  it('aborts the replaced log read when refresh is requested', async () => {
    const calls: ReadLogsCall[] = [];
    const readLogs = vi.fn(async (containerName: string, lines: number, options?: { signal?: AbortSignal }) => {
      calls.push({ containerName, lines, signal: options?.signal });
      return new Promise<string>((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason ?? new Error('aborted')),
          { once: true },
        );
      });
    });

    const { stdin } = await renderRuntime(readLogs);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.containerName).toBe('sonarr');

    stdin.write('r');
    await flushEffects();

    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(calls[1]?.containerName).toBe('sonarr');
    expect(calls[1]?.signal?.aborted).toBe(false);
  });

  it('aborts the active log read when the TUI unmounts', async () => {
    const calls: ReadLogsCall[] = [];
    const readLogs = vi.fn(async (containerName: string, lines: number, options?: { signal?: AbortSignal }) => {
      calls.push({ containerName, lines, signal: options?.signal });
      return new Promise<string>((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason ?? new Error('aborted')),
          { once: true },
        );
      });
    });

    const { instance } = await renderRuntime(readLogs);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal?.aborted).toBe(false);

    instance.unmount();
    await flushEffects();

    expect(calls[0]?.signal?.aborted).toBe(true);
  });
});
