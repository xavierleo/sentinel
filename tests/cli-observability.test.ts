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

describe('observability cli commands', () => {
  it('prints cost summary through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['cost'], harness.io, {
      summarizeCost: async () => 'Cost: $0.0123 across 1 calls',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Cost: $0.0123 across 1 calls']);
  });

  it('prints replay events through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['replay', 'cli:local:default'], harness.io, {
      replaySession: async () => 'user: hello\nagent: hi',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['user: hello\nagent: hi']);
  });
});
