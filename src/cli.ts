import { Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { runAgentTurn } from './agent/loop.js';
import type { ChannelRunner, InboundRunContext } from './channels/types.js';
import { createGrammyTelegramChannel } from './channels/telegram.js';
import { refreshContainerInventory } from './memory/inventory-refresh.js';
import { createMemoryRepository } from './memory/repository.js';
import { createAnthropicModelClient } from './model/anthropic.js';
import { createCostLedger } from './observability/cost-ledger.js';
import { createReplayRepository } from './observability/replay.js';
import { createInMemoryTracer } from './observability/tracer.js';
import { createDefaultPermissionEngine } from './permissions/engine.js';
import { createYamlPermissionEngine } from './permissions/rules.js';
import { createAuditRepository } from './storage/audit.js';
import { createStateDatabase } from './storage/database.js';
import { createContainerListTool } from './tools/container.js';
import { createDefaultToolRegistry } from './tools/index.js';

export const versionLabel = 'Sentinel v2.0 Milestone 5';

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
  inbound?: InboundRunContext;
}

export interface CliDependencies {
  runAgent: (message: string, context: CliRunContext) => Promise<string>;
  refreshMemory: () => Promise<string>;
  startTelegram: () => Promise<void>;
  summarizeCost: () => Promise<string>;
  replaySession: (sessionId: string) => Promise<string>;
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
  const runAgent: CliDependencies['runAgent'] = async (message, context) => {
    const dbPath = stateDbPath();
    await mkdir(dirname(dbPath), { recursive: true });
    const db = createStateDatabase(dbPath);
    const memory = createMemoryRepository(db);
    const tools = createDefaultToolRegistry({ memory });

    try {
      const result = await runAgentTurn({
        message,
        tools,
        permissions: await createPermissionEngine(),
        audit: createAuditRepository(db),
        memorySummary: memory.summarizeInventory(),
        sessionId: context.inbound?.sessionId,
        tracer: createInMemoryTracer(),
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
  };

  return {
    runAgent,

    async refreshMemory() {
      const dbPath = stateDbPath();
      await mkdir(dirname(dbPath), { recursive: true });
      const db = createStateDatabase(dbPath);
      const memory = createMemoryRepository(db);
      const containerList = createContainerListTool();

      try {
        const result = await refreshContainerInventory({
          memory,
          listContainers: () => containerList.execute({}),
        });

        return `Memory refreshed: ${result.containers} containers`;
      } finally {
        db.close();
      }
    },

    async startTelegram() {
      const runner: ChannelRunner = (message, inbound) =>
        runAgent(message, {
          inbound,
          confirmTool: inbound.confirmTool ?? (async () => false),
        });
      const channel = createGrammyTelegramChannel({
        token: process.env.TELEGRAM_BOT_TOKEN,
        authorizedUserId: process.env.TELEGRAM_USER_ID ? Number(process.env.TELEGRAM_USER_ID) : undefined,
        runAgent: runner,
      });

      io.stdout('Telegram channel started');
      await channel.start?.();
    },

    async summarizeCost() {
      const dbPath = stateDbPath();
      await mkdir(dirname(dbPath), { recursive: true });
      const db = createStateDatabase(dbPath);
      const ledger = createCostLedger(db);
      const now = new Date();
      const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const to = from + 86_400_000;

      try {
        const summary = ledger.summarize({ from, to });
        return [
          `Cost: $${summary.costUsd.toFixed(4)} across ${summary.calls} calls`,
          `Tokens: ${summary.tokensIn} in, ${summary.tokensOut} out, ${summary.cachedTokensIn} cached in`,
        ].join('\n');
      } finally {
        db.close();
      }
    },

    async replaySession(sessionId) {
      const dbPath = stateDbPath();
      await mkdir(dirname(dbPath), { recursive: true });
      const db = createStateDatabase(dbPath);
      const replay = createReplayRepository(db);

      try {
        const events = replay.readSession(sessionId);
        if (events.length === 0) {
          return `No replay events for ${sessionId}`;
        }

        return events.map((event) => `${event.actor}: ${JSON.stringify(event.payload)}`).join('\n');
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
      io.stdout(['Sentinel status', 'Milestone: 5 observability', 'Persistence: SQLite memory, audit, cost, replay enabled', 'Channels: CLI and Telegram'].join('\n'));
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
    .command('cost')
    .description('Show model cost summary for today')
    .action(async () => {
      io.stdout(await deps.summarizeCost());
    });

  program
    .command('replay')
    .description('Print replay events for a session')
    .argument('<session_id>', 'Session id to replay')
    .action(async (sessionId: string) => {
      io.stdout(await deps.replaySession(sessionId));
    });

  program
    .command('telegram')
    .description('Start Telegram channel')
    .action(async () => {
      await deps.startTelegram();
    });

  program
    .command('memory')
    .description('Memory operations')
    .argument('<subcommand>', 'Memory subcommand')
    .action(async (subcommand: string) => {
      if (subcommand !== 'refresh') {
        throw new Error(`Unknown memory subcommand: ${subcommand}`);
      }

      io.stdout(await deps.refreshMemory());
    });

  program
    .command('run')
    .description('Run a single Sentinel turn')
    .argument('<message...>', 'Message to send to Sentinel')
    .action(async (parts: string[]) => {
      const message = parts.join(' ').trim();
      const response = await deps.runAgent(message, {
        inbound: { channel: 'cli', userId: 'local', sessionId: 'cli:local:default' },
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
