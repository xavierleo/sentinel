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

describe('cli permissions', () => {
  it('lists configured permission rules', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['permissions', 'list'], harness.io, {
      listPermissions: async () => ['Allow rules:', '- container_list', 'Deny rules:', '- container_action(name=*, action=remove)'].join('\n'),
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual([
      ['Allow rules:', '- container_list', 'Deny rules:', '- container_action(name=*, action=remove)'].join('\n'),
    ]);
  });

  it('adds allow and deny permission rules', async () => {
    const harness = createHarness();
    const added: string[] = [];

    const allowExitCode = await runCli(['permissions', 'allow', 'fs_read'], harness.io, {
      addPermissionRule: async (decision, rule) => {
        added.push(`${decision}:${rule}`);
        return `Added ${decision} rule: ${rule}`;
      },
    });
    const denyExitCode = await runCli(['permissions', 'deny', 'container_action(name=*, action=remove)'], harness.io, {
      addPermissionRule: async (decision, rule) => {
        added.push(`${decision}:${rule}`);
        return `Added ${decision} rule: ${rule}`;
      },
    });

    expect(allowExitCode).toBe(0);
    expect(denyExitCode).toBe(0);
    expect(added).toEqual(['allow:fs_read', 'deny:container_action(name=*, action=remove)']);
  });

  it('removes permission rules', async () => {
    const harness = createHarness();
    const removed: string[] = [];

    const exitCode = await runCli(['permissions', 'remove', 'allow', 'fs_read'], harness.io, {
      removePermissionRule: async (decision, rule) => {
        removed.push(`${decision}:${rule}`);
        return `Removed ${decision} rule: ${rule}`;
      },
    });

    expect(exitCode).toBe(0);
    expect(removed).toEqual(['allow:fs_read']);
  });
});
