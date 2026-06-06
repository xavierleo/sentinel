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

describe('cli logs command', () => {
  it('prints audit logs through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['logs'], harness.io, {
      listAuditLogs: async () => 'Audit log:\n- 1 container_list allow',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Audit log:\n- 1 container_list allow']);
    expect(harness.stderr).toEqual([]);
  });

  it('passes an optional limit to the audit log dependency', async () => {
    const harness = createHarness();
    const limits: number[] = [];

    const exitCode = await runCli(['logs', '--limit', '5'], harness.io, {
      listAuditLogs: async (limit) => {
        limits.push(limit);
        return `limit ${limit}`;
      },
    });

    expect(exitCode).toBe(0);
    expect(limits).toEqual([5]);
    expect(harness.stdout).toEqual(['limit 5']);
  });
});
