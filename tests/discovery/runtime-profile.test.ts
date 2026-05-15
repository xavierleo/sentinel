import { describe, expect, it } from 'vitest';
import { buildRuntimeProfile } from '../../src/discovery/runtime-profile.js';

describe('runtime profile builder', () => {
  it('normalizes Docker container data into a runtime service profile', () => {
    const profile = buildRuntimeProfile({
      id: 'abc123',
      name: '/sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      state: 'running',
      health: undefined,
      labels: {
        'com.docker.compose.project': 'media',
        'com.docker.compose.service': 'sonarr',
        'com.docker.compose.project.working_dir': '/opt/stacks/media',
      },
      ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
      mounts: [{ host: '/opt/appdata/sonarr', container: '/config', mode: 'rw' }],
      networks: ['media_default'],
      restartPolicy: 'unless-stopped',
      createdAt: '2026-05-14T12:00:00+02:00',
    });

    expect(profile).toMatchObject({
      id: 'sonarr',
      displayName: 'Sonarr',
      source: 'runtime_discovery',
      containerName: 'sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      status: 'running',
      health: 'unknown',
      composeProject: 'media',
      composeService: 'sonarr',
      stackDir: '/opt/stacks/media',
      createdBySentinel: false,
    });
  });

  it('copies Docker summary ports, mounts, and networks into the runtime service profile', () => {
    const container = {
      id: 'abc123',
      name: '/sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      state: 'running',
      health: undefined,
      labels: {},
      ports: [{ host: 8989, container: 8989, protocol: 'tcp' as const }],
      mounts: [{ host: '/opt/appdata/sonarr', container: '/config', mode: 'rw' }],
      networks: ['media_default'],
      restartPolicy: 'unless-stopped',
      createdAt: '2026-05-14T12:00:00+02:00',
    };

    const profile = buildRuntimeProfile(container);

    container.ports[0].host = 8990;
    container.mounts[0].host = '/opt/appdata/sonarr-updated';
    container.networks[0] = 'media_updated';

    expect(profile.ports).toEqual([{ host: 8989, container: 8989, protocol: 'tcp' }]);
    expect(profile.mounts).toEqual([
      { host: '/opt/appdata/sonarr', container: '/config', mode: 'rw' },
    ]);
    expect(profile.networks).toEqual(['media_default']);
  });

  it('omits compose fields when Docker compose labels are absent', () => {
    const profile = buildRuntimeProfile({
      id: 'abc123',
      name: '/sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      state: 'running',
      health: undefined,
      labels: {},
      ports: [],
      mounts: [],
      networks: [],
      restartPolicy: 'unless-stopped',
      createdAt: '2026-05-14T12:00:00+02:00',
    });

    expect(profile).not.toHaveProperty('composeProject');
    expect(profile).not.toHaveProperty('composeService');
    expect(profile).not.toHaveProperty('stackDir');
  });
});
