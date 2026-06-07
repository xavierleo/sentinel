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

describe('cli chat command', () => {
  it('starts an injected interactive chat runner', async () => {
    const harness = createHarness();
    const calls: string[] = [];

    const exitCode = await runCli(['chat'], harness.io, {
      startChat: async () => {
        calls.push('chat');
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual(['chat']);
    expect(harness.stderr).toEqual([]);
  });
});
