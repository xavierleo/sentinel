import React from 'react';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'ink';
import { SentinelTuiApp } from '../../src/tui/app.js';
import type { LogPreviewView } from '../../src/tui/log-preview.js';
import type { TuiReadModel } from '../../src/tui/types.js';

const model: TuiReadModel = {
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
      containerName: 'sonarr',
      displayName: 'Sonarr',
      status: 'running',
      health: 'unknown',
      portsLabel: '8989:8989/tcp',
      composeProjectLabel: 'sonarr',
    },
  ],
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
  },
  footer: {
    snapshotAgeLabel: 'fresh snapshot',
    safetyLabel: 'read-only',
    keyHints: '? help · r refresh · q quit',
  },
};

const logPreview: LogPreviewView = {
  title: 'Recent logs for sonarr',
  lines: ['RSS sync complete'],
  truncated: false,
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
    const output = await renderOutput(
      <SentinelTuiApp model={model} helpOpen={false} logPreview={logPreview} selectedIndex={0} />,
    );

    expect(output).toContain('Sentinel Console');
    expect(output).toContain('Watchtower');
    expect(output).toContain('Runtime Inventory');
    expect(output).toContain('Focus');
    expect(output).toContain('RSS sync complete');
  });
});
