import { describe, expect, it } from 'vitest';
import { createInteractiveChatSession, runCli } from '../src/cli.js';

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

  it('reloads the workspace snapshot by moving subsequent turns to a fresh chat session id', async () => {
    const stdout: string[] = [];
    const sessionIds: string[] = [];
    const inputs = ['hello', '/reload', 'hello again', '/exit'];

    await createInteractiveChatSession({
      stdout: (message) => stdout.push(message),
      ask: async () => inputs.shift() ?? '/exit',
      runAgent: async (_message, context) => {
        sessionIds.push(context.inbound?.sessionId ?? '');
        return `response ${sessionIds.length}`;
      },
      confirmTool: async () => false,
    });

    expect(sessionIds).toEqual(['cli:local:chat', 'cli:local:chat:reload-1']);
    expect(stdout).toEqual([
      'Sentinel chat started. Type /exit, /quit, or /reload.',
      'response 1',
      'Workspace snapshot will reload on the next turn.',
      'response 2',
    ]);
  });
});
