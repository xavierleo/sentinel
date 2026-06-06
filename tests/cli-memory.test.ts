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
});
