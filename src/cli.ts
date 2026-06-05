import { Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { runAgentTurn } from './agent/loop.js';
import { createAnthropicModelClient } from './model/anthropic.js';
import { createDefaultPermissionEngine } from './permissions/engine.js';
import { createYamlPermissionEngine } from './permissions/rules.js';
import { createAuditRepository } from './storage/audit.js';
import { createStateDatabase } from './storage/database.js';
import { createDefaultToolRegistry } from './tools/index.js';

export const versionLabel = 'Sentinel v2.0 Milestone 2';

export interface CliConfirmationRequest {
  toolName: string;
  input: unknown;
  reason: string;
}

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  confirmTool?: (request: CliConfirmationRequest) => Promise<boolean>;
}

export interface CliRunContext {
  confirmTool: (request: CliConfirmationRequest) => Promise<boolean>;
}

export interface CliDependencies {
  runAgent: (message: string, context: CliRunContext) => Promise<string>;
}

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  async confirmTool(request) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `Approve ${request.toolName} ${JSON.stringify(request.input)}? ${request.reason} [y/N] `,
      );
      return answer.trim().toLowerCase() === 'y';
    } finally {
      rl.close();
    }
  },
};

function stateDbPath(): string {
  return process.env.SENTINEL_DB_PATH ?? join(homedir(), '.sentinel', 'sentinel.db');
}

async function createPermissionEngine() {
  if (process.env.SENTINEL_PERMISSIONS_PATH) {
    return createYamlPermissionEngine({ rulesPath: process.env.SENTINEL_PERMISSIONS_PATH });
  }

  return createDefaultPermissionEngine();
}

function createDefaultDependencies(io: CliIo): CliDependencies {
  return {
    async runAgent(message, context) {
      const dbPath = stateDbPath();
      await mkdir(dirname(dbPath), { recursive: true });
      const db = createStateDatabase(dbPath);
      const tools = createDefaultToolRegistry();

      try {
        const result = await runAgentTurn({
          message,
          tools,
          permissions: await createPermissionEngine(),
          audit: createAuditRepository(db),
          confirm: ({ tool, input, permission }) =>
            context.confirmTool({
              toolName: tool.name,
              input,
              reason: permission.reason,
            }),
          model: createAnthropicModelClient({ apiKey: process.env.ANTHROPIC_API_KEY }),
        });

        return result.text;
      } finally {
        db.close();
      }
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
      io.stdout(['Sentinel status', 'Milestone: 2 safety and persistence', 'Persistence: SQLite audit enabled', 'Channels: CLI only'].join('\n'));
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
      const response = await deps.runAgent(message, {
        confirmTool: async (request) => {
          const confirm = io.confirmTool ?? defaultIo.confirmTool;
          return confirm ? confirm(request) : false;
        },
      });
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
  const resolvedDeps = { ...createDefaultDependencies(io), ...deps };
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
