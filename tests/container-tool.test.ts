import { describe, expect, it, vi } from 'vitest';
import { createContainerListTool } from '../src/tools/container.js';

describe('container_list tool', () => {
  it('parses Docker JSON output from execa', async () => {
    const execa = vi.fn().mockResolvedValue({
      stdout: [
        JSON.stringify({
          ID: 'abc123',
          Names: 'sonarr',
          Image: 'lscr.io/linuxserver/sonarr:latest',
          State: 'running',
          Status: 'Up 10 minutes',
          Ports: '0.0.0.0:8989->8989/tcp',
        }),
      ].join('\n'),
    });

    const tool = createContainerListTool({ execa });

    await expect(tool.execute({ filter: 'status=running' })).resolves.toEqual({
      containers: [
        {
          id: 'abc123',
          name: 'sonarr',
          image: 'lscr.io/linuxserver/sonarr:latest',
          state: 'running',
          status: 'Up 10 minutes',
          ports: '0.0.0.0:8989->8989/tcp',
        },
      ],
    });
    expect(execa).toHaveBeenCalledWith('docker', [
      'ps',
      '--all',
      '--format',
      '{{json .}}',
      '--filter',
      'status=running',
    ]);
  });
});
