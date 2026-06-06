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

describe('doctor cli command', () => {
  it('runs doctor through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['doctor'], harness.io, {
      runDoctor: async () => 'Doctor: ok',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Doctor: ok']);
  });
});
