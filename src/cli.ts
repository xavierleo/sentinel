import { Command } from 'commander';
import { runAgentTurn } from './agent/loop.js';
import { createAnthropicModelClient } from './model/anthropic.js';
import { createPermissionEngineV0 } from './permissions/engine.js';
import { createDefaultToolRegistry } from './tools/index.js';

export const versionLabel = 'Sentinel v2.0 Milestone 1';

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export interface CliDependencies {
  runAgent: (message: string) => Promise<string>;
}

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

function createDefaultDependencies(): CliDependencies {
  return {
    async runAgent(message) {
      const tools = createDefaultToolRegistry();
      const result = await runAgentTurn({
        message,
        tools,
        permissions: createPermissionEngineV0(),
        model: createAnthropicModelClient({ apiKey: process.env.ANTHROPIC_API_KEY }),
      });

      return result.text;
    },
  };
}

function createProgram(io: CliIo, deps: CliDependencies): Command {
  const program = new Command();
  program
    .name('sentinel')
    .description('Sentinel v2 homelab AI harness')
    .version(versionLabel, '--version', 'Print version information')
    .helpOption('--help', 'Show help');

  program
    .command('status')
    .description('Show local Sentinel status')
    .action(() => {
      io.stdout(['Sentinel status', 'Milestone: 1 walking skeleton', 'Persistence: not implemented', 'Channels: CLI only'].join('\n'));
    });

  program
    .command('tools')
    .description('List registered tools')
    .action(() => {
      const names = createDefaultToolRegistry()
        .list()
        .map((tool) => tool.name)
        .sort();
      io.stdout(names.join('\n'));
    });

  program
    .command('run')
    .description('Run a single Sentinel turn')
    .argument('<message...>', 'Message to send to Sentinel')
    .action(async (parts: string[]) => {
      const message = parts.join(' ').trim();
      const response = await deps.runAgent(message);
      io.stdout(response);
    });

  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => io.stdout(str.trimEnd()),
    writeErr: (str) => io.stderr(str.trimEnd()),
  });

  return program;
}

export async function runCli(argv: string[], io: CliIo = defaultIo, deps: Partial<CliDependencies> = {}): Promise<number> {
  const resolvedDeps = { ...createDefaultDependencies(), ...deps };
  const program = createProgram(io, resolvedDeps);

  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'commander.version') {
      return 0;
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === 'commander.helpDisplayed') {
      return 0;
    }

    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
