import { describe, expect, it } from 'vitest';
import { runCli, type CliConfirmationDecision, type CliConfirmationRequest } from '../src/cli.js';

function createHarness(confirm: (request: CliConfirmationRequest) => Promise<boolean>) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const confirmations: CliConfirmationRequest[] = [];

  return {
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
      confirmTool: async (request: CliConfirmationRequest) => {
        confirmations.push(request);
        return confirm(request);
      },
    },
    stdout,
    stderr,
    confirmations,
  };
}

describe('cli milestone 2 confirmation UX', () => {
  it('passes confirmation decisions through injected run dependencies', async () => {
    const harness = createHarness(async () => true);
    let confirmationResult: CliConfirmationDecision = false;

    const exitCode = await runCli(['run', 'restart sonarr'], harness.io, {
      runAgent: async (_message, context) => {
        confirmationResult = await context.confirmTool({
          toolName: 'container_action',
          input: { name: 'sonarr', action: 'restart', dry_run: true },
          reason: 'no permission rule matched',
        });
        return confirmationResult ? 'approved' : 'denied';
      },
    });

    expect(exitCode).toBe(0);
    expect(confirmationResult).toBe(true);
    expect(harness.confirmations).toEqual([
      {
        toolName: 'container_action',
        input: { name: 'sonarr', action: 'restart', dry_run: true },
        reason: 'no permission rule matched',
      },
    ]);
    expect(harness.stdout).toEqual(['approved']);
  });
});
