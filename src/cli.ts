import { Command } from 'commander';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
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
import type { MemoryRepository } from './memory/repository.js';
import { createConfiguredModelClient } from './model/factory.js';
import { createCostLedger } from './observability/cost-ledger.js';
import { evaluateBudgetPolicy } from './observability/budget-policy.js';
import { createReplayRepository } from './observability/replay.js';
import { replaySession as replayRecordedSession } from './observability/replay-runner.js';
import { createJsonlRuntimeLogger } from './observability/runtime-logger.js';
import { createOtlpTracer } from './observability/otlp-tracer.js';
import { createInMemoryTracer } from './observability/tracer.js';
import { runDoctor } from './ops/doctor.js';
import { createStartupChecks } from './ops/startup-checks.js';
import { createDefaultPermissionEngine } from './permissions/engine.js';
import {
  addPermissionRule as addPermissionRuleToFile,
  createYamlPermissionEngine,
  listPermissionRules,
  removePermissionRule as removePermissionRuleFromFile,
} from './permissions/rules.js';
import type { PermissionRuleDecision } from './permissions/rules.js';
import { createSessionLockManager } from './sessions/lock-manager.js';
import { createSessionRepository } from './sessions/repository.js';
import { createAuditRepository } from './storage/audit.js';
import { createBackupScheduler } from './storage/backup-scheduler.js';
import { createStateDatabase } from './storage/database.js';
import { createContainerListTool } from './tools/container.js';
import { createDefaultToolRegistry } from './tools/index.js';

export const versionLabel = 'Sentinel v2.0 Milestone 7';

export interface CliConfirmationRequest {
  toolName: string;
  input: unknown;
  reason: string;
}

export type CliConfirmationDecision = boolean | 'remember';

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  confirmTool?: (request: CliConfirmationRequest) => Promise<CliConfirmationDecision>;
}

export interface CliRunContext {
  confirmTool: (request: CliConfirmationRequest) => Promise<CliConfirmationDecision>;
  inbound?: InboundRunContext;
}

export interface CliDependencies {
  runAgent: (message: string, context: CliRunContext) => Promise<string>;
  startChat: () => Promise<void>;
  refreshMemory: () => Promise<string>;
  summarizeMemory: () => Promise<string>;
  searchMemory: (query: string) => Promise<string>;
  getMemoryEntity: (entityId: string) => Promise<string>;
  startTelegram: () => Promise<void>;
  summarizeCost: () => Promise<string>;
  replaySession: (sessionId: string) => Promise<string>;
  listAuditLogs: (limit: number) => Promise<string>;
  runDoctor: () => Promise<string>;
  startDaemon: () => Promise<void>;
  listPermissions: () => Promise<string>;
  addPermissionRule: (decision: PermissionRuleDecision, rule: string) => Promise<string>;
  removePermissionRule: (decision: PermissionRuleDecision, rule: string) => Promise<string>;
}

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  async confirmTool(request) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `Approve ${request.toolName} ${JSON.stringify(request.input)}? ${request.reason} [y/N/a] `,
      );
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'a') {
        return 'remember';
      }

      return normalized === 'y';
    } finally {
      rl.close();
    }
  },
};

function stateDbPath(): string {
  return process.env.SENTINEL_DB_PATH ?? join(homedir(), '.sentinel', 'sentinel.db');
}

function permissionRulesPath(): string {
  return process.env.SENTINEL_PERMISSIONS_PATH ?? join(homedir(), '.sentinel', 'permissions.yaml');
}

function backupPath(): string | undefined {
  return process.env.SENTINEL_BACKUP_PATH;
}

function backupDir(): string {
  return process.env.SENTINEL_BACKUP_DIR ?? join(homedir(), '.sentinel', 'backups');
}

function runtimeLogPath(): string {
  return process.env.SENTINEL_LOG_PATH ?? '/var/log/sentinel/sentinel.jsonl';
}

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_USER_ID);
}

async function canWritePath(path: string): Promise<boolean> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await access(dirname(path), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function createDefaultStartupChecks() {
  return createStartupChecks({
    backupPath: backupPath(),
    hasModelApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    logPath: runtimeLogPath(),
    telegramConfigured: telegramConfigured(),
    openaiFallbackConfigured: Boolean(process.env.OPENAI_API_KEY),
    canWritePath,
  });
}

async function createPermissionEngine() {
  return createYamlPermissionEngine({ rulesPath: permissionRulesPath(), fallback: createDefaultPermissionEngine() });
}

function formatPermissionRule(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') {
    return toolName;
  }

  const matchers = Object.entries(input as Record<string, unknown>)
    .filter((entry): entry is [string, string | number | boolean] =>
      ['string', 'number', 'boolean'].includes(typeof entry[1]),
    )
    .map(([key, value]) => `${key}=${String(value)}`);

  return matchers.length > 0 ? `${toolName}(${matchers.join(', ')})` : toolName;
}

function formatPermissionRules(rules: { allow: string[]; deny: string[] }): string {
  const allow = rules.allow.length > 0 ? rules.allow.map((rule) => `- ${rule}`) : ['- none'];
  const deny = rules.deny.length > 0 ? rules.deny.map((rule) => `- ${rule}`) : ['- none'];
  return ['Allow rules:', ...allow, 'Deny rules:', ...deny].join('\n');
}

function formatMemorySearchResults(query: string, results: ReturnType<MemoryRepository['search']>): string {
  if (results.length === 0) {
    return `Search results for ${query}: none`;
  }

  return [
    `Search results for ${query}:`,
    ...results.map((result) =>
      [
        `- ${result.kind}: ${result.title}`,
        result.entityId ? `  entity: ${result.entityId}` : undefined,
        `  ${result.body}`,
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n');
}

function formatMemoryEntity(entity: ReturnType<MemoryRepository['getEntity']>, entityId: string): string {
  if (!entity) {
    return `Entity ${entityId}: not found`;
  }

  const attrs = Object.entries(entity.attrs);
  return [
    `Entity ${entity.id}`,
    `kind: ${entity.kind}`,
    `name: ${entity.name}`,
    `firstSeenAt: ${entity.firstSeenAt}`,
    `lastSeenAt: ${entity.lastSeenAt}`,
    ...(attrs.length > 0 ? ['attrs:', ...attrs.map(([key, value]) => `- ${key}: ${value}`)] : ['attrs: none']),
    ...(entity.notes.length > 0 ? ['notes:', ...entity.notes.map((note) => `- #${note.id} ${note.body}`)] : ['notes: none']),
  ].join('\n');
}

function formatAuditLogs(events: ReturnType<ReturnType<typeof createAuditRepository>['listEvents']>): string {
  if (events.length === 0) {
    return 'Audit log: empty';
  }

  return [
    'Audit log:',
    ...events.map((event) =>
      [
        `- #${event.id} ${new Date(event.timestamp).toISOString()} ${event.sessionId}`,
        `  tool: ${event.toolName}`,
        `  permission: ${event.permissionDecision} (${event.permissionReason})`,
        `  input: ${JSON.stringify(event.input)}`,
      ].join('\n'),
    ),
  ].join('\n');
}

async function ignoreTelemetryFailure(task: Promise<unknown>, io: CliIo): Promise<void> {
  try {
    await task;
  } catch (error) {
    io.stderr(`Telemetry warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createDefaultDependencies(io: CliIo): CliDependencies {
  const locks = createSessionLockManager();
  const logger = createJsonlRuntimeLogger({ logPath: runtimeLogPath() });

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
      const tracer = process.env.SENTINEL_OTLP_ENDPOINT
        ? createOtlpTracer({
            endpoint: process.env.SENTINEL_OTLP_ENDPOINT,
            serviceName: process.env.SENTINEL_OTLP_SERVICE_NAME ?? 'sentinel',
          })
        : createInMemoryTracer();

      try {
        await ignoreTelemetryFailure(
          logger.info('agent turn started', { sessionId, channel: context.inbound?.channel ?? 'cli' }),
          io,
        );
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
          tracer,
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
          rememberPermission: async ({ tool, input }) => {
            await addPermissionRuleToFile({
              rulesPath: permissionRulesPath(),
              decision: 'allow',
              rule: formatPermissionRule(tool.name, input),
            });
          },
          model: createConfiguredModelClient({
            anthropicApiKey: process.env.ANTHROPIC_API_KEY,
            openaiApiKey: process.env.OPENAI_API_KEY,
            localModelUrl: process.env.SENTINEL_LOCAL_MODEL_URL,
            localModelName: process.env.SENTINEL_LOCAL_MODEL_NAME,
          }),
        });
        await ignoreTelemetryFailure(logger.info('agent turn completed', { sessionId }), io);
        if ('flush' in tracer && typeof tracer.flush === 'function') {
          await ignoreTelemetryFailure(tracer.flush(), io);
        }

        return result.text;
      } catch (error) {
        await ignoreTelemetryFailure(
          logger.error('agent turn failed', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          }),
          io,
        );
        throw error;
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

  const startChat: CliDependencies['startChat'] = async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    io.stdout('Sentinel chat started. Type /exit or /quit to leave.');

    try {
      for (;;) {
        const message = (await rl.question('sentinel> ')).trim();
        if (!message) {
          continue;
        }

        if (message === '/exit' || message === '/quit') {
          return;
        }

        const response = await runAgent(message, {
          inbound: { channel: 'cli', userId: 'local', sessionId: 'cli:local:chat' },
          confirmTool: async (request) => {
            const confirm = io.confirmTool ?? defaultIo.confirmTool;
            return confirm ? confirm(request) : false;
          },
        });
        io.stdout(response);
      }
    } finally {
      rl.close();
    }
  };

  const summarizeMemory: CliDependencies['summarizeMemory'] = async () => {
    const dbPath = stateDbPath();
    await mkdir(dirname(dbPath), { recursive: true });
    const db = createStateDatabase(dbPath);
    const memory = createMemoryRepository(db);

    try {
      return [memory.summarizeInventory(), memory.summarizePreferences()].join('\n\n');
    } finally {
      db.close();
    }
  };

  const searchMemory: CliDependencies['searchMemory'] = async (query) => {
    const dbPath = stateDbPath();
    await mkdir(dirname(dbPath), { recursive: true });
    const db = createStateDatabase(dbPath);
    const memory = createMemoryRepository(db);

    try {
      return formatMemorySearchResults(query, memory.search({ query }));
    } finally {
      db.close();
    }
  };

  const getMemoryEntity: CliDependencies['getMemoryEntity'] = async (entityId) => {
    const dbPath = stateDbPath();
    await mkdir(dirname(dbPath), { recursive: true });
    const db = createStateDatabase(dbPath);
    const memory = createMemoryRepository(db);

    try {
      return formatMemoryEntity(memory.getEntity(entityId), entityId);
    } finally {
      db.close();
    }
  };

  return {
    runAgent,
    startChat,
    refreshMemory,
    summarizeMemory,
    searchMemory,
    getMemoryEntity,

    async startDaemon() {
      let ready = false;
      const backupScheduler = createBackupScheduler({
        sourcePath: stateDbPath(),
        backupDir: backupDir(),
      });
      const runner = createDaemonRunner({
        recoverInFlightSessions: async () => {
          const dbPath = stateDbPath();
          await mkdir(dirname(dbPath), { recursive: true });
          const db = createStateDatabase(dbPath);
          const sessions = createSessionRepository(db);

          try {
            const recovered = sessions.recoverInFlightSessions({ failedAt: Date.now() });
            if (recovered.length > 0) {
              io.stdout(`Recovered ${recovered.length} in-flight session step${recovered.length === 1 ? '' : 's'}`);
            }
          } finally {
            db.close();
          }
        },
        runStartupChecks: async () =>
          runDoctor({
            checks: createDefaultStartupChecks(),
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
        runScheduledBackup: async () => {
          const result = await backupScheduler.runIfDue();
          if (result.ran) {
            io.stdout(`Backup completed: ${result.backupPath}`);
          }
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

        const result = await replayRecordedSession({
          sourceSessionId: sessionId,
          replaySessionId: `replay:${sessionId}:${Date.now()}`,
          replay,
          runTurn: (message) =>
            runAgent(message, {
              inbound: { channel: 'cli', userId: 'local', sessionId: `replay:${sessionId}` },
              confirmTool: async () => false,
            }),
        });

        if (result.turns.length === 0) {
          return `No replayable user messages for ${sessionId}`;
        }

        return [
          `Replay ${result.replaySessionId}`,
          ...result.turns.map((turn) =>
            [
              `user: ${turn.userMessage}`,
              `original: ${turn.originalText ?? '[missing]'}`,
              `replay: ${turn.replayText}`,
            ].join('\n'),
          ),
        ].join('\n');
      } finally {
        db.close();
      }
    },

    async listAuditLogs(limit) {
      const dbPath = stateDbPath();
      await mkdir(dirname(dbPath), { recursive: true });
      const db = createStateDatabase(dbPath);
      const audit = createAuditRepository(db);

      try {
        return formatAuditLogs(audit.listEvents({ limit }));
      } finally {
        db.close();
      }
    },

    async runDoctor() {
      const result = await runDoctor({
        checks: createDefaultStartupChecks(),
      });

      return [
        result.ok ? 'Doctor: ok' : 'Doctor: failed',
        ...result.checks.map((check) => `${check.name}: ${check.ok ? 'ok' : 'failed'} - ${check.message}`),
      ].join('\n');
    },

    async listPermissions() {
      return formatPermissionRules(await listPermissionRules({ rulesPath: permissionRulesPath() }));
    },

    async addPermissionRule(decision, rule) {
      await addPermissionRuleToFile({ rulesPath: permissionRulesPath(), decision, rule });
      return `Added ${decision} rule: ${rule}`;
    },

    async removePermissionRule(decision, rule) {
      await removePermissionRuleFromFile({ rulesPath: permissionRulesPath(), decision, rule });
      return `Removed ${decision} rule: ${rule}`;
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
    .command('logs')
    .description('Print recent audit log events')
    .option('--limit <count>', 'Number of events to print', '50')
    .action(async (options: { limit: string }) => {
      const limit = Number.parseInt(options.limit, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('Log limit must be a positive integer');
      }

      io.stdout(await deps.listAuditLogs(limit));
    });

  program
    .command('telegram')
    .description('Start Telegram channel')
    .action(async () => {
      await deps.startTelegram();
    });

  program
    .command('permissions')
    .description('Manage permission rules')
    .argument('<subcommand>', 'Permission subcommand: list, allow, deny, remove')
    .argument('[args...]', 'Permission rule arguments')
    .action(async (subcommand: string, args: string[]) => {
      if (subcommand === 'list') {
        io.stdout(await deps.listPermissions());
        return;
      }

      if (subcommand === 'allow' || subcommand === 'deny') {
        const rule = args.join(' ').trim();
        if (!rule) {
          throw new Error(`Missing ${subcommand} permission rule`);
        }

        io.stdout(await deps.addPermissionRule(subcommand, rule));
        return;
      }

      if (subcommand === 'remove') {
        const [decision, ...ruleParts] = args;
        if (decision !== 'allow' && decision !== 'deny') {
          throw new Error('Permission remove requires decision: allow or deny');
        }

        const rule = ruleParts.join(' ').trim();
        if (!rule) {
          throw new Error('Missing permission rule to remove');
        }

        io.stdout(await deps.removePermissionRule(decision, rule));
        return;
      }

      throw new Error(`Unknown permissions subcommand: ${subcommand}`);
    });

  program
    .command('memory')
    .description('Memory operations')
    .argument('<subcommand>', 'Memory subcommand')
    .argument('[args...]', 'Memory subcommand arguments')
    .action(async (subcommand: string, args: string[]) => {
      if (subcommand === 'refresh') {
        io.stdout(await deps.refreshMemory());
        return;
      }

      if (subcommand === 'summary') {
        io.stdout(await deps.summarizeMemory());
        return;
      }

      if (subcommand === 'search') {
        const query = args.join(' ').trim();
        if (!query) {
          throw new Error('Missing memory search query');
        }

        io.stdout(await deps.searchMemory(query));
        return;
      }

      if (subcommand === 'get') {
        const entityId = args.join(' ').trim();
        if (!entityId) {
          throw new Error('Missing memory entity id');
        }

        io.stdout(await deps.getMemoryEntity(entityId));
        return;
      }

      throw new Error(`Unknown memory subcommand: ${subcommand}`);
    });

  program
    .command('chat')
    .description('Start an interactive Sentinel chat session')
    .action(async () => {
      await deps.startChat();
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
