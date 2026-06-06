import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

describe('cli confirmation remember decision', () => {
  it('passes approve-and-remember decisions from the CLI confirmation prompt to the agent runner', async () => {
    const decisions: unknown[] = [];

    const exitCode = await runCli(
      ['run', 'restart plex'],
      {
        stdout: () => undefined,
        stderr: () => undefined,
        confirmTool: async () => 'remember',
      },
      {
        runAgent: async (_message, context) => {
          decisions.push(
            await context.confirmTool({
              toolName: 'container_action',
              input: { name: 'plex', action: 'restart', dry_run: false },
              reason: 'no permission rule matched',
            }),
          );
          return 'ok';
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(decisions).toEqual(['remember']);
  });
});
