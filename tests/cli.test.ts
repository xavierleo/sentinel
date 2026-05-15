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

  it('keeps inventory honest until Docker discovery is wired', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['inventory'], harness.io);

    expect(exitCode).toBe(2);
    expect(harness.stderr.join('\n')).toContain('Docker discovery is not implemented yet');
  });

  it('rejects unknown commands', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['wat'], harness.io);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown command: wat');
  });
});
