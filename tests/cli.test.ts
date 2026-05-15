import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import type { RuntimeInventoryResult } from '../src/discovery/docker-discovery.js';

function createHarness() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
    stdout,
    stderr,
  };
}

describe('cli', () => {
  it('prints the version label', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['--version'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Sentinel v1.0 Runtime Awareness']);
    expect(harness.stderr).toEqual([]);
  });

  it('prints help for --help', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['--help'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Usage: sentinel <command>');
  });

  it('reports install status without pretending the daemon exists', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['status'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Foundation: installed');
    expect(harness.stdout.join('\n')).toContain('Daemon: not implemented yet');
  });

  it('prints Docker inventory when discovery succeeds', async () => {
    const harness = createHarness();

    const inventory: RuntimeInventoryResult = {
      status: 'ok',
      profiles: [
        {
          id: 'sonarr',
          displayName: 'Sonarr',
          source: 'runtime_discovery',
          containerName: 'sonarr',
          image: 'lscr.io/linuxserver/sonarr:latest',
          status: 'running',
          health: 'healthy',
          composeProject: 'media',
          composeService: 'sonarr',
          stackDir: '/opt/stacks/media',
          ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
          mounts: [],
          networks: ['media'],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T10:00:00.000Z',
        },
      ],
    };

    const exitCode = await runCli(['inventory'], harness.io, {
      discoverInventory: async () => inventory,
    });

    expect(exitCode).toBe(0);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout.join('\n')).toContain('Sentinel runtime inventory');
    expect(harness.stdout.join('\n')).toContain('Containers: 1 running, 0 stopped');
    expect(harness.stdout.join('\n')).toContain('sonarr');
    expect(harness.stdout.join('\n')).toContain('8989:8989/tcp');
  });

  it('prints structured Docker inventory with inventory --json', async () => {
    const harness = createHarness();

    const inventory: RuntimeInventoryResult = {
      status: 'ok',
      profiles: [
        {
          id: 'sonarr',
          displayName: 'Sonarr',
          source: 'runtime_discovery',
          containerName: 'sonarr',
          image: 'lscr.io/linuxserver/sonarr:latest',
          status: 'running',
          health: 'healthy',
          ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
          mounts: [],
          networks: ['media'],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T10:00:00.000Z',
        },
        {
          id: 'tdarr',
          displayName: 'Tdarr',
          source: 'runtime_discovery',
          containerName: 'tdarr',
          image: 'ghcr.io/haveagitgat/tdarr:latest',
          status: 'exited',
          health: 'unknown',
          ports: [],
          mounts: [],
          networks: [],
          restartPolicy: 'unless-stopped',
          createdBySentinel: false,
          lastSeenAt: '2026-05-15T10:00:00.000Z',
        },
      ],
    };

    const exitCode = await runCli(['inventory', '--json'], harness.io, {
      discoverInventory: async () => inventory,
    });

    expect(exitCode).toBe(0);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0] ?? '')).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-15T10:00:00.000Z',
      counts: {
        total: 2,
        running: 1,
        stopped: 1,
      },
      services: inventory.profiles,
    });
  });

  it('rejects unsupported inventory flags', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory', '--wat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown inventory option: --wat');
  });

  it('prints a clear inventory error when Docker is missing', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory'], harness.io, {
      discoverInventory: async () => ({ status: 'docker_unavailable', message: 'Docker is not installed.' }),
    });

    expect(exitCode).toBe(2);
    expect(harness.stderr.join('\n')).toContain('Docker is not installed');
  });

  it('runs chat with --message through the chat loop', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['chat', '--message', "what's running?"], harness.io, {
      discoverInventory: async () => ({ status: 'ok', profiles: [] }),
      runChat: async (message) => `echo:${message}`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(["echo:what's running?"]);
    expect(harness.stderr).toEqual([]);
  });

  it('prints deterministic inventory chat output for what is running', async () => {
    const harness = createHarness();
    const messages: string[] = [];

    const exitCode = await runCli(['chat', '--message', "what's running?"], harness.io, {
      discoverInventory: async () => ({ status: 'ok', profiles: [] }),
      runChat: async (message) => {
        messages.push(message);
        return 'Sentinel runtime inventory\nContainers: 1 running, 0 stopped\n\nSonarr | running | 8989:8989/tcp';
      },
    });

    expect(exitCode).toBe(0);
    expect(messages).toEqual(["what's running?"]);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout[0]).toContain('Sentinel runtime inventory');
  });

  it('prints deterministic log chat output for recent logs', async () => {
    const harness = createHarness();
    const messages: string[] = [];

    const exitCode = await runCli(['chat', '--message', 'show me recent logs for sonarr'], harness.io, {
      discoverInventory: async () => ({ status: 'ok', profiles: [] }),
      runChat: async (message) => {
        messages.push(message);
        return 'Recent logs for sonarr\n\n[line one]';
      },
    });

    expect(exitCode).toBe(0);
    expect(messages).toEqual(['show me recent logs for sonarr']);
    expect(harness.stderr).toEqual([]);
    expect(harness.stdout[0]).toContain('Recent logs for sonarr');
  });

  it('rejects chat without --message for now', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['chat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('chat currently requires --message');
  });

  it('rejects unknown commands', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['wat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown command: wat');
  });
});
