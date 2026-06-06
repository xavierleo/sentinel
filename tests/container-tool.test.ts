import { describe, expect, it, vi } from 'vitest';
import {
  createContainerInspectTool,
  createContainerListTool,
  createContainerLogsTool,
  createContainerStatsTool,
} from '../src/tools/container.js';
import { createDefaultToolRegistry } from '../src/tools/index.js';

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

describe('container detail tools', () => {
  it('inspects a container and returns parsed Docker inspect JSON', async () => {
    const inspect = {
      Id: 'abc123',
      Name: '/sonarr',
      Config: { Image: 'lscr.io/linuxserver/sonarr:latest' },
      State: { Status: 'running', Health: { Status: 'healthy' } },
      NetworkSettings: { Ports: { '8989/tcp': [{ HostIp: '0.0.0.0', HostPort: '8989' }] } },
      Mounts: [{ Type: 'bind', Source: '/srv/sonarr', Destination: '/config' }],
    };
    const execa = vi.fn().mockResolvedValue({ stdout: JSON.stringify([inspect]) });
    const tool = createContainerInspectTool({ execa });

    await expect(tool.execute({ name: 'sonarr' })).resolves.toEqual({
      id: 'abc123',
      name: 'sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      state: 'running',
      health: 'healthy',
      ports: [{ containerPort: '8989/tcp', hostIp: '0.0.0.0', hostPort: '8989' }],
      mounts: [{ type: 'bind', source: '/srv/sonarr', destination: '/config' }],
    });
    expect(execa).toHaveBeenCalledWith('docker', ['inspect', 'sonarr']);
  });

  it('reads recent container logs with an optional line count and since filter', async () => {
    const execa = vi.fn().mockResolvedValue({ stdout: 'line one\nline two' });
    const tool = createContainerLogsTool({ execa });

    await expect(tool.execute({ name: 'sonarr', lines: 50, since: '1h' })).resolves.toEqual({
      name: 'sonarr',
      logs: 'line one\nline two',
    });
    expect(execa).toHaveBeenCalledWith('docker', ['logs', '--tail', '50', '--since', '1h', 'sonarr']);
  });

  it('reads one-shot container stats and parses numeric fields', async () => {
    const execa = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        Name: 'sonarr',
        CPUPerc: '0.25%',
        MemUsage: '120MiB / 1GiB',
        MemPerc: '11.72%',
        NetIO: '1.2kB / 3.4kB',
        BlockIO: '0B / 12MB',
        PIDs: '21',
      }),
    });
    const tool = createContainerStatsTool({ execa });

    await expect(tool.execute({ name: 'sonarr' })).resolves.toEqual({
      name: 'sonarr',
      cpuPercent: 0.25,
      memoryUsage: '120MiB / 1GiB',
      memoryPercent: 11.72,
      networkIo: '1.2kB / 3.4kB',
      blockIo: '0B / 12MB',
      pids: 21,
    });
    expect(execa).toHaveBeenCalledWith('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{json .}}',
      'sonarr',
    ]);
  });

  it('registers container inspect, logs, and stats in the default tool registry', () => {
    const names = createDefaultToolRegistry()
      .list()
      .map((tool) => tool.name);

    expect(names).toContain('container_inspect');
    expect(names).toContain('container_logs');
    expect(names).toContain('container_stats');
  });
});
