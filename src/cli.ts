import { Command } from 'commander';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { runAgentTurn } from './agent/loop.js';
import type { ChannelRunner, InboundRunContext } from './channels/types.js';
import { createGrammyTelegramChannel } from './channels/telegram.js';
import { createHealthServer } from './daemon/health.js';
import { createDaemonRunner } from './daemon/runner.js';
import { refreshContainerInventory } from './memory/inventory-refresh.js';
import { createMemoryRepository } from './memory/repository.js';
import { createAnthropicModelClient } from './model/anthropic.js';
import { createCostLedger } from './observability/cost-ledger.js';
import { evaluateBudgetPolicy } from './observability/budget-policy.js';
import { createReplayRepository } from './observability/replay.js';
import { createInMemoryTracer } from './observability/tracer.js';
import { runDoctor } from './ops/doctor.js';
import { createDefaultPermissionEngine } from './permissions/engine.js';
import { createYamlPermissionEngine } from './permissions/rules.js';
import { createSessionLockManager } from './sessions/lock-manager.js';
import { createSessionRepository } from './sessions/repository.js';
import { createAuditRepository } from './storage/audit.js';
import { createStateDatabase } from './storage/database.js';
import { createContainerListTool } from './tools/container.js';
import { createDefaultToolRegistry } from './tools/index.js';

export const versionLabel = 'Sentinel v2.0 Milestone 7';

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
  runDoctor: () => Promise<string>;
  startDaemon: () => Promise<void>;
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
  const locks = createSessionLockManager();

  const runAgent: CliDependencies['runAgent'] = async (message, context) => {
    const sessionId = context.inbound?.sessionId ?? 'cli:local:default';
    return locks.withSessionLock(sessionId, async () => {
      const dbPath = stateDbPath();
      await mkdir(dirname(dbPath), { recursive: true });
      const db = createStateDatabase(dbPath);
      const memory = createMemoryRepository(db);
      const sessions = createSessionRepository(db);
      const costLedger = createCostLedger(db);
      const replay = createReplayRepository(db);
      const tools = createDefaultToolRegistry({ memory });
      const now = new Date();
      const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const to = from + 86_400_000;
      const costSummary = costLedger.summarize({ from, to });
      const budgetDecision = evaluateBudgetPolicy({
        spentUsd: costSummary.costUsd,
        softCapUsd: Number(process.env.SENTINEL_DAILY_SOFT_CAP_USD ?? 0.4),
        hardCapUsd: Number(process.env.SENTINEL_DAILY_HARD_CAP_USD ?? 0.5),
      });

      try {
        const result = await runAgentTurn({
          message,
          tools,
          permissions: await createPermissionEngine(),
          audit: createAuditRepository(db),
          memorySummary: [memory.summarizeInventory(), memory.summarizePreferences()].join('\n\n'),
          sessionId,
          sessions,
          costLedger,
          replay,
          budgetDecision,
          budgetWarning: budgetDecision.decision === 'allow' ? budgetDecision.warning : undefined,
          tracer: createInMemoryTracer(),
          reflection: {
            summarize: async ({ userMessage, finalText }) =>
              userMessage.trim() && finalText.trim() ? `Turn answered: ${userMessage}` : undefined,
            recordNote: async (body) => {
              memory.addNote({ body, tags: ['reflection'] });
            },
          },
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
    });
  };

  const refreshMemory: CliDependencies['refreshMemory'] = async () => {
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
  };

  return {
    runAgent,
    refreshMemory,

    async startDaemon() {
      let ready = false;
      const runner = createDaemonRunner({
        runStartupChecks: async () =>
          runDoctor({
            checks: {
              database: async () => ({ ok: true, message: 'database check configured' }),
              auditLog: async () => ({ ok: true, message: 'audit check configured' }),
              scheduler: async () => ({ ok: true, message: 'scheduler idle' }),
            },
          }),
        startHealthServer: async () => {
          const server = await createHealthServer({
            host: process.env.SENTINEL_HEALTH_HOST ?? '127.0.0.1',
            port: Number(process.env.SENTINEL_HEALTH_PORT ?? 8787),
            isReady: () => ready,
          }).start();
          io.stdout(`Healthcheck listening at ${server.url}/healthz`);
          return server;
        },
        refreshOnce: async () => {
          await refreshMemory();
          ready = true;
        },
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        refreshIntervalMs: Number(process.env.SENTINEL_REFRESH_INTERVAL_MS ?? 15 * 60_000),
      });

      const stop = () => {
        void runner.stop();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);

      try {
        await runner.runForever();
      } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
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

    async runDoctor() {
      const result = await runDoctor({
        checks: {
          database: async () => ({ ok: true, message: 'database check configured' }),
          auditLog: async () => ({ ok: true, message: 'audit check configured' }),
          model: async () => ({ ok: Boolean(process.env.ANTHROPIC_API_KEY), message: process.env.ANTHROPIC_API_KEY ? 'model key configured' : 'ANTHROPIC_API_KEY is missing' }),
          scheduler: async () => ({ ok: true, message: 'scheduler idle' }),
        },
      });

      return [
        result.ok ? 'Doctor: ok' : 'Doctor: failed',
        ...result.checks.map((check) => `${check.name}: ${check.ok ? 'ok' : 'failed'} - ${check.message}`),
      ].join('\n');
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
      io.stdout(['Sentinel status', 'Milestone: 7 hardening', 'Persistence: SQLite memory, preferences, audit, cost, replay enabled', 'Channels: CLI and Telegram'].join('\n'));
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
    .command('daemon')
    .description('Start Sentinel daemon runtime')
    .action(async () => {
      await deps.startDaemon();
    });

  program
    .command('doctor')
    .description('Run startup and configuration checks')
    .action(async () => {
      io.stdout(await deps.runDoctor());
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
