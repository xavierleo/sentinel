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

describe('cli memory commands', () => {
  it('runs memory refresh through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['memory', 'refresh'], harness.io, {
      refreshMemory: async () => 'Memory refreshed: 1 containers',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Memory refreshed: 1 containers']);
    expect(harness.stderr).toEqual([]);
  });

  it('prints a memory summary through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['memory', 'summary'], harness.io, {
      summarizeMemory: async () => ['Inventory memory:', '- container sonarr (container:sonarr)'].join('\n'),
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual([['Inventory memory:', '- container sonarr (container:sonarr)'].join('\n')]);
    expect(harness.stderr).toEqual([]);
  });

  it('searches memory through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['memory', 'search', 'sonarr'], harness.io, {
      searchMemory: async (query) => `Search results for ${query}\n- inventory container sonarr`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Search results for sonarr\n- inventory container sonarr']);
    expect(harness.stderr).toEqual([]);
  });

  it('gets a memory entity through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['memory', 'get', 'container:sonarr'], harness.io, {
      getMemoryEntity: async (entityId) => `Entity ${entityId}\nkind: container`,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Entity container:sonarr\nkind: container']);
    expect(harness.stderr).toEqual([]);
  });
});
