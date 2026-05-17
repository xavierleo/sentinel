import React from 'react';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'ink';
import { SentinelTuiApp } from '../../src/tui/app.js';
import type { LogPreviewView } from '../../src/tui/log-preview.js';
import type { TuiReadModel } from '../../src/tui/types.js';

const sonarrLogPreview: LogPreviewView = {
  containerName: 'sonarr',
  title: 'Recent logs for sonarr',
  lines: ['RSS sync complete'],
  truncated: false,
};

const baseModel: TuiReadModel = {
  watchtower: {
    hostname: 'cerebro',
    snapshotAgeLabel: 'fresh snapshot',
    freshness: 'fresh',
    runningCount: 1,
    stoppedCount: 1,
    dockerVersion: '29.4.3',
    memoryLabel: '8162/15295 MB',
    diskLabel: '110G/915G used',
  },
  inventoryRows: [
    {
      containerName: 'radarr',
      displayName: 'Radarr',
      status: 'exited',
      health: 'unknown',
      portsLabel: '7878:7878/tcp',
      composeProjectLabel: 'radarr',
    },
    {
      containerName: 'sonarr',
      displayName: 'Sonarr',
      status: 'running',
      health: 'unknown',
      portsLabel: '8989:8989/tcp',
      composeProjectLabel: 'sonarr',
    },
  ],
  selectedInventoryIndex: 1,
  focusService: {
    containerName: 'sonarr',
    displayName: 'Sonarr',
    image: 'lscr.io/linuxserver/sonarr:latest',
    status: 'running',
    health: 'unknown',
    composeProjectLabel: 'sonarr',
    composeServiceLabel: 'sonarr',
    stackDirLabel: '/opt/stacks/sonarr',
    restartPolicy: 'unless-stopped',
    portsLabel: '8989:8989/tcp',
    mountsLabel: '-',
    networksLabel: 'cerebro-net',
    logPreview: sonarrLogPreview,
  },
  footer: {
    snapshotAgeLabel: 'fresh snapshot',
    safetyLabel: 'read-only',
    keyHints: '? help · r refresh · q quit',
  },
};

const activeInstances: Array<{ unmount: () => void; cleanup: () => void }> = [];

afterEach(() => {
  for (const instance of activeInstances.splice(0)) {
    instance.unmount();
    instance.cleanup();
  }
});

async function renderOutput(node: React.JSX.Element): Promise<string> {
  const stdout = new PassThrough();
  let output = '';
  stdout.on('data', (chunk: Buffer | string) => {
    output += chunk.toString();
  });

  const instance = render(node, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    patchConsole: false,
  });

  activeInstances.push(instance);
  await new Promise((resolve) => setTimeout(resolve, 0));

  return output;
}

describe('sentinel tui app', () => {
  it('renders the three-pane shell', async () => {
    const output = await renderOutput(<SentinelTuiApp model={baseModel} helpOpen={false} />);

    expect(output).toContain('Sentinel Console');
    expect(output).toContain('Watchtower');
    expect(output).toContain('Runtime Inventory');
    expect(output).toContain('Focus');
    expect(output).toContain('RSS sync complete');
  });

  it('keeps the inventory highlight aligned with the focused service', async () => {
    const output = await renderOutput(<SentinelTuiApp model={baseModel} helpOpen={false} />);

    expect(output).not.toContain('> radarr');
    expect(output).toContain('> sonarr | running | unknown |');
    expect(output).toContain('Recent logs for');
    expect(output).toContain('RSS sync complete');
  });

  it('renders focused logs only when they belong to the focused service', async () => {
    const mismatchedModel: TuiReadModel = {
      ...baseModel,
      focusService: {
        ...baseModel.focusService!,
        logPreview: {
          containerName: 'radarr',
          title: 'Recent logs for radarr',
          lines: ['Radarr queue refreshed'],
          truncated: false,
        },
      },
    };
    const output = await renderOutput(<SentinelTuiApp model={mismatchedModel} helpOpen={false} />);

    expect(output).toContain('Recent logs for');
    expect(output).toContain('No recent events');
    expect(output).toContain('available.');
    expect(output).not.toContain('Recent logs for radarr');
    expect(output).not.toContain('Radarr queue refreshed');
  });

  it('renders coherent empty inventory and focus states', async () => {
    const emptyModel: TuiReadModel = {
      ...baseModel,
      inventoryRows: [],
      selectedInventoryIndex: undefined,
      focusService: undefined,
      emptyState: {
        kind: 'no_snapshot',
        title: 'No stored runtime snapshot',
        body: 'Start sentinel daemon, wait for the first refresh, then press r to retry.',
      },
    };
    const output = await renderOutput(<SentinelTuiApp model={emptyModel} helpOpen={false} />);

    expect(output).toContain('No services in the latest');
    expect(output).toContain('No service');
    expect(output).toContain('selected.');
    expect(output).toContain('No stored runtime snapshot');
  });

  it('opens help as an overlay layer instead of growing the shell', async () => {
    const closedOutput = await renderOutput(<SentinelTuiApp model={baseModel} helpOpen={false} />);
    const openOutput = await renderOutput(<SentinelTuiApp model={baseModel} helpOpen />);
    const closedLines = closedOutput.trimEnd().split('\n').length;
    const openLines = openOutput.trimEnd().split('\n').length;

    expect(openOutput).toContain('Keyboard shortcuts');
    expect(openLines - closedLines).toBeLessThanOrEqual(1);
  });
});
