import { runChatLoop } from './agent/chat-loop.js';
import { createOllamaDecisionCaller } from './agent/ollama-client.js';
import { defaultConfig } from './config/defaults.js';
import { getVersionLabel } from './index.js';
import { createRefreshService } from './daemon/refresh-service.js';
import { createDaemonRunner } from './daemon/runner.js';
import { discoverDockerInventory, type RuntimeInventoryResult } from './discovery/docker-discovery.js';
import { createHostStatusTool } from './tools/host.js';
import { buildRuntimeInventoryPayload } from './discovery/runtime-inventory.js';
import type { RuntimeServiceProfile } from './discovery/runtime-profile.js';
import { createRuntimeSnapshotsRepository } from './storage/runtime-snapshots-repository.js';
import { createStateDatabase } from './storage/sqlite.js';
import type { JsonValue, PersistedRuntimeService, PersistedSnapshotRead } from './storage/types.js';
import { createRuntimeToolRegistry } from './tools/index.js';

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export interface CliDependencies {
  discoverInventory: () => Promise<RuntimeInventoryResult>;
  readLatestSnapshot: () => PersistedSnapshotRead | undefined;
  runChat: (message: string) => Promise<string>;
  runDaemon: () => Promise<void>;
}

function getFirstSeenAt(profile: RuntimeServiceProfile): string {
  if ('firstSeenAt' in profile && typeof profile.firstSeenAt === 'string') {
    return profile.firstSeenAt;
  }

  return profile.lastSeenAt;
}

const usage = `Usage: sentinel <command>

Commands:
  --version, -v   Print version information
  --help, -h      Show this help
  status          Show local installation status
  inventory       Show runtime inventory status
  inventory --json
                  Show runtime inventory as structured JSON
  daemon          Start daemon
  chat            Start chat client (not implemented yet)
  tui             Start TUI client (not implemented yet)`;

const defaultIo: CliIo = {
  stdout: (message: string) => console.log(message),
  stderr: (message: string) => console.error(message),
};

const defaultDeps: CliDependencies = {
  discoverInventory: () => discoverDockerInventory(),
  readLatestSnapshot: () => {
    const db = createStateDatabase(defaultConfig.storage.sqlite_path);

    try {
      return createRuntimeSnapshotsRepository(db).readLatestSnapshot();
    } finally {
      db.close();
    }
  },
  runChat: async (message: string) =>
    runChatLoop({
      message,
      config: defaultConfig,
      toolRegistry: createRuntimeToolRegistry(),
      callModel: createOllamaDecisionCaller(defaultConfig),
      hostname: 'localhost',
    }),
  runDaemon: async () => {
    const db = createStateDatabase(defaultConfig.storage.sqlite_path);
    const repository = createRuntimeSnapshotsRepository(db);
    const hostStatusTool = createHostStatusTool();
    const refreshService = createRefreshService({
      collectRuntimeInventory: async () => {
        const inventory = await discoverDockerInventory();
        if (inventory.status !== 'ok') {
          throw new Error(inventory.message);
        }

        return {
          hostname: null,
          dockerVersion: null,
          composeVersion: null,
          rawRuntimeInventory: {
            status: inventory.status,
            profiles: inventory.profiles,
          } as unknown as JsonValue,
          services: inventory.profiles.map((profile) => ({
            profileId: profile.id,
            displayName: profile.displayName,
            source: profile.source,
            containerName: profile.containerName,
            image: profile.image,
            status: profile.status,
            health: profile.health,
            composeProject: profile.composeProject ?? null,
            composeService: profile.composeService ?? null,
            stackDir: profile.stackDir ?? null,
            createdBySentinel: profile.createdBySentinel,
            firstSeenAt: getFirstSeenAt(profile),
            lastSeenAt: profile.lastSeenAt,
            restartPolicy: profile.restartPolicy,
            ports: profile.ports,
            mounts: profile.mounts,
            networks: profile.networks,
          })),
        };
      },
      collectHostStatus: async () => {
        const hostStatus = await hostStatusTool();

        return {
          rawHostStatus: hostStatus as unknown as JsonValue,
          hostStatus: {
            hostname: hostStatus.hostname,
            kernel: hostStatus.platform.kernel,
            uptime: hostStatus.uptime,
            memory: hostStatus.memory,
            rootDisk: hostStatus.rootDisk,
            dockerServerVersion: hostStatus.docker.serverVersion,
            dockerComposeVersion: hostStatus.docker.composeVersion,
          },
        };
      },
      repository,
      now: () => new Date().toISOString(),
    });
    const runner = createDaemonRunner({
      refreshOnce: () => refreshService.refreshOnce(),
      sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
      refreshIntervalMs: parseDurationMs(defaultConfig.runtime_inventory.refresh_interval),
      logger: {
        info: (message: string) => console.log(message),
      },
    });

    const stop = () => runner.stop();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
      await runner.run();
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      db.close();
    }
  },
};

function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Invalid refresh interval: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return amount * unitMs;
}

function printNotImplemented(command: string, io: CliIo): number {
  io.stderr(`${command} is not implemented yet in Sentinel v1.0 foundation.`);
  return 2;
}

function formatPorts(profile: RuntimeServiceProfile): string {
  if (profile.ports.length === 0) {
    return '-';
  }

  return profile.ports.map((port) => `${port.host}:${port.container}/${port.protocol}`).join(', ');
}

function toRuntimeServiceProfile(service: PersistedRuntimeService): RuntimeServiceProfile {
  return {
    id: service.profileId,
    displayName: service.displayName,
    source: 'runtime_discovery',
    containerName: service.containerName,
    image: service.image,
    status: service.status,
    health: service.health ?? 'unknown',
    composeProject: service.composeProject ?? undefined,
    composeService: service.composeService ?? undefined,
    stackDir: service.stackDir ?? undefined,
    ports: service.ports.map((port) => ({ ...port })),
    mounts: service.mounts.map((mount) => ({ ...mount })),
    networks: [...service.networks],
    createdBySentinel: false,
    lastSeenAt: service.lastSeenAt,
    restartPolicy: service.restartPolicy,
  };
}

function readInventoryProfilesFromSnapshot(snapshot: PersistedSnapshotRead): RuntimeServiceProfile[] {
  return snapshot.services.map((service) => toRuntimeServiceProfile(service));
}

function formatInventory(profiles: RuntimeServiceProfile[]): string {
  const running = profiles.filter((profile) => profile.status === 'running').length;
  const stopped = profiles.length - running;
  const rows = profiles
    .slice()
    .sort((a, b) => a.containerName.localeCompare(b.containerName))
    .map((profile) => {
      const compose = profile.composeProject ? ` compose=${profile.composeProject}/${profile.composeService ?? '-'}` : '';
      return `${profile.containerName}  ${profile.status}  ${profile.image}  ${formatPorts(profile)}${compose}`;
    });

  return [
    'Sentinel runtime inventory',
    `Containers: ${running} running, ${stopped} stopped`,
    '',
    'NAME  STATUS  IMAGE  PORTS',
    ...rows,
  ].join('\n');
}

function formatInventoryJson(result: RuntimeInventoryResult, generatedAt?: string): string {
  return JSON.stringify(buildRuntimeInventoryPayload(result, { generatedAt }), null, 2);
}

function parseChatMessageArgs(args: string[]): { ok: true; message: string } | { ok: false; error: string } {
  if (args[0] !== '--message') {
    return { ok: false, error: 'chat currently requires --message "<text>"' };
  }

  const message = args.slice(1).join(' ').trim();
  if (!message) {
    return { ok: false, error: 'chat currently requires --message "<text>"' };
  }

  return { ok: true, message };
}

export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
  deps: Partial<CliDependencies> = defaultDeps,
): Promise<number> {
  const resolvedDeps: CliDependencies = { ...defaultDeps, ...deps };
  const [command, ...args] = argv;

  switch (command) {
    case undefined:
    case '--help':
    case '-h':
      io.stdout(usage);
      return 0;

    case '--version':
    case '-v':
      io.stdout(getVersionLabel());
      return 0;

    case 'status':
      {
        let snapshot: PersistedSnapshotRead | undefined;

        try {
          snapshot = resolvedDeps.readLatestSnapshot();
        } catch (error) {
          io.stderr(error instanceof Error ? error.message : String(error));
          return 2;
        }

        const snapshotLines = snapshot
          ? [`Snapshots: available`, `Latest snapshot: ${snapshot.createdAt}`]
          : [`Snapshots: none`, 'Latest snapshot: never'];

        io.stdout(`Sentinel status
Foundation: installed
Daemon: not implemented yet
Chat: not implemented yet
TUI: not implemented yet
${snapshotLines.join('\n')}`);
        return 0;
      }

    case 'inventory':
      {
        const json = args.includes('--json');
        const unsupportedOption = args.find((arg) => arg !== '--json');
        if (unsupportedOption) {
          io.stderr(`Unknown inventory option: ${unsupportedOption}`);
          return 1;
        }

        let snapshot: PersistedSnapshotRead | undefined;

        try {
          snapshot = resolvedDeps.readLatestSnapshot();
        } catch (error) {
          io.stderr(error instanceof Error ? error.message : String(error));
          return 2;
        }

        if (!snapshot) {
          io.stderr('No stored runtime snapshot is available yet. Start `sentinel daemon` and wait for the first refresh.');
          return 2;
        }

        const profiles = readInventoryProfilesFromSnapshot(snapshot);
        const result: RuntimeInventoryResult = {
          status: 'ok',
          profiles,
        };

        io.stdout(json ? formatInventoryJson(result, snapshot.createdAt) : formatInventory(profiles));
        return 0;
      }

    case 'daemon':
      try {
        await resolvedDeps.runDaemon();
        return 0;
      } catch (error) {
        io.stderr(error instanceof Error ? error.message : String(error));
        return 2;
      }

    case 'tui':
      return printNotImplemented(command, io);

    case 'chat':
      {
        const parsed = parseChatMessageArgs(args);
        if (!parsed.ok) {
          io.stderr(parsed.error);
          return 1;
        }

        try {
          io.stdout(await resolvedDeps.runChat(parsed.message));
          return 0;
        } catch (error) {
          io.stderr(error instanceof Error ? error.message : String(error));
          return 2;
        }
      }

    default:
      io.stderr(`Unknown command: ${command}`);
      io.stdout(usage);
      return 1;
  }
}
