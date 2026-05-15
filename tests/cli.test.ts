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

  it('prints a clear inventory error when Docker is missing', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory'], harness.io, {
      discoverInventory: async () => ({ status: 'docker_unavailable', message: 'Docker is not installed.' }),
    });

    expect(exitCode).toBe(2);
    expect(harness.stderr.join('\n')).toContain('Docker is not installed');
  });

  it('rejects unknown commands', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['wat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown command: wat');
  });
});
