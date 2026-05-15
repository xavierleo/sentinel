import { describe, expect, it } from 'vitest';
import { discoverDockerInventory, type DockerCommandRunner } from '../../src/discovery/docker-discovery.js';

function createRunner(responses: Record<string, string | Error>): DockerCommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const response = responses[key];

    if (response instanceof Error) {
      throw response;
    }

    if (response === undefined) {
      throw new Error(`Unexpected command: ${key}`);
    }

    return { stdout: response };
  };
}

describe('docker discovery', () => {
  it('reports when Docker is not installed', async () => {
    const result = await discoverDockerInventory({
      run: createRunner({
        'docker ps -a --format json': Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      }),
    });

    expect(result.status).toBe('docker_unavailable');
  });

  it('reports when the Docker daemon is unavailable', async () => {
    const result = await discoverDockerInventory({
      run: createRunner({
        'docker ps -a --format json': new Error('Cannot connect to the Docker daemon'),
      }),
    });

    expect(result.status).toBe('daemon_unavailable');
  });

  it('reports when Docker socket permissions block discovery', async () => {
    const result = await discoverDockerInventory({
      run: createRunner({
        'docker ps -a --format json': new Error('permission denied while trying to connect to the docker API'),
      }),
    });

    expect(result.status).toBe('daemon_unavailable');
  });

  it('builds runtime profiles from docker ps and inspect output', async () => {
    const psOutput = [
      JSON.stringify({
        ID: 'abc123',
        Names: 'sonarr',
        Image: 'lscr.io/linuxserver/sonarr:latest',
        State: 'running',
      }),
    ].join('\n');
    const inspectOutput = JSON.stringify([
      {
        Id: 'abc123456789',
        Name: '/sonarr',
        Config: {
          Image: 'lscr.io/linuxserver/sonarr:latest',
          Labels: {
            'com.docker.compose.project': 'media',
            'com.docker.compose.service': 'sonarr',
            'com.docker.compose.project.working_dir': '/opt/stacks/media',
          },
        },
        State: {
          Status: 'running',
          Health: { Status: 'healthy' },
        },
        Created: '2026-05-15T10:00:00Z',
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
        },
        NetworkSettings: {
          Ports: {
            '8989/tcp': [{ HostIp: '0.0.0.0', HostPort: '8989' }],
          },
          Networks: {
            media: {},
            proxy: {},
          },
        },
        Mounts: [
          {
            Source: '/srv/media/config/sonarr',
            Destination: '/config',
            Mode: 'rw',
          },
        ],
      },
    ]);

    const result = await discoverDockerInventory({
      run: createRunner({
        'docker ps -a --format json': psOutput,
        'docker inspect abc123': inspectOutput,
      }),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error('Expected successful inventory');
    }
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]).toMatchObject({
      id: 'sonarr',
      containerName: 'sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      status: 'running',
      health: 'healthy',
      composeProject: 'media',
      composeService: 'sonarr',
      stackDir: '/opt/stacks/media',
      restartPolicy: 'unless-stopped',
      networks: ['media', 'proxy'],
      ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
      mounts: [{ host: '/srv/media/config/sonarr', container: '/config', mode: 'rw' }],
    });
  });

  it('deduplicates equivalent published port bindings', async () => {
    const psOutput = JSON.stringify({
      ID: 'pihole123',
      Names: 'pihole',
      Image: 'pihole/pihole:latest',
      State: 'running',
    });
    const inspectOutput = JSON.stringify([
      {
        Id: 'pihole123456789',
        Name: '/pihole',
        Config: {
          Image: 'pihole/pihole:latest',
          Labels: {},
        },
        State: { Status: 'running' },
        Created: '2026-05-15T10:00:00Z',
        HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
        NetworkSettings: {
          Ports: {
            '53/tcp': [
              { HostIp: '0.0.0.0', HostPort: '53' },
              { HostIp: '::', HostPort: '53' },
            ],
            '53/udp': [
              { HostIp: '0.0.0.0', HostPort: '53' },
              { HostIp: '::', HostPort: '53' },
            ],
            '80/tcp': [
              { HostIp: '0.0.0.0', HostPort: '8053' },
              { HostIp: '::', HostPort: '8053' },
            ],
          },
          Networks: {},
        },
        Mounts: [],
      },
    ]);

    const result = await discoverDockerInventory({
      run: createRunner({
        'docker ps -a --format json': psOutput,
        'docker inspect pihole123': inspectOutput,
      }),
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error('Expected successful inventory');
    }
    expect(result.profiles[0]?.ports).toEqual([
      { host: 53, container: 53, protocol: 'tcp' },
      { host: 53, container: 53, protocol: 'udp' },
      { host: 8053, container: 80, protocol: 'tcp' },
    ]);
  });
});
