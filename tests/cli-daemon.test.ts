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

describe('daemon cli command', () => {
  it('starts daemon through injected dependencies', async () => {
    const harness = createHarness();
    let calls = 0;

    const exitCode = await runCli(['daemon'], harness.io, {
      startDaemon: async () => {
        calls += 1;
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toBe(1);
  });
});
