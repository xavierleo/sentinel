import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

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
    expect(harness.stdout).toEqual(['Sentinel v2.0 Milestone 7']);
    expect(harness.stderr).toEqual([]);
  });

  it('lists registered tools', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['tools'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('fs_list');
    expect(harness.stdout.join('\n')).toContain('fs_read');
    expect(harness.stdout.join('\n')).toContain('container_list');
  });

  it('runs a message through an injected agent runner', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['run', 'what containers are running?'], harness.io, {
      runAgent: async (message) => `answer for: ${message}`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['answer for: what containers are running?']);
  });

  it('prints clean stderr and exits non-zero when the agent cannot start', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['run', 'hello'], harness.io, {
      runAgent: async () => {
        throw new Error('ANTHROPIC_API_KEY is required');
      },
    });

    expect(exitCode).toBe(2);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['ANTHROPIC_API_KEY is required']);
  });

  it('prints walking skeleton status', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['status'], harness.io);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Milestone: 7 hardening');
  });

  it('runs workspace initialization through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['init'], harness.io, {
      initWorkspace: async () => 'Workspace initialized: /tmp/sentinel-workspace',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Workspace initialized: /tmp/sentinel-workspace']);
  });

  it('routes workspace proposal subcommands through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['workspace', 'list-proposals'], harness.io, {
      listWorkspaceProposals: async () => 'No workspace proposals',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['No workspace proposals']);
  });

  it('lists skills through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['skill', 'list'], harness.io, {
      listSkills: async () => 'triage: Triage services',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['triage: Triage services']);
  });

  it('matches skills through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['skill', 'match', 'plex is down'], harness.io, {
      matchSkills: async (message) => `Matched skills for ${message}:\n- triage`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Matched skills for plex is down:\n- triage']);
  });

  it('runs consolidation through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['consolidate', 'cli:local:chat'], harness.io, {
      consolidateSession: async (sessionId) => `Consolidated ${sessionId}: 1 proposal`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Consolidated cli:local:chat: 1 proposal']);
  });
});
