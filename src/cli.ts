import { getVersionLabel } from './index.js';
import { discoverDockerInventory, type RuntimeInventoryResult } from './discovery/docker-discovery.js';
import { buildRuntimeInventoryPayload } from './discovery/runtime-inventory.js';
import type { RuntimeServiceProfile } from './discovery/runtime-profile.js';

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export interface CliDependencies {
  discoverInventory: () => Promise<RuntimeInventoryResult>;
}

const usage = `Usage: sentinel <command>

Commands:
  --version, -v   Print version information
  --help, -h      Show this help
  status          Show local installation status
  inventory       Show runtime inventory status
  inventory --json
                  Show runtime inventory as structured JSON
  daemon          Start daemon (not implemented yet)
  chat            Start chat client (not implemented yet)
  tui             Start TUI client (not implemented yet)`;

const defaultIo: CliIo = {
  stdout: (message: string) => console.log(message),
  stderr: (message: string) => console.error(message),
};

const defaultDeps: CliDependencies = {
  discoverInventory: () => discoverDockerInventory(),
};

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

function formatInventoryJson(result: RuntimeInventoryResult): string {
  return JSON.stringify(buildRuntimeInventoryPayload(result), null, 2);
}

export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
  deps: CliDependencies = defaultDeps,
): Promise<number> {
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
      io.stdout(`Sentinel status
Foundation: installed
Daemon: not implemented yet
Chat: not implemented yet
TUI: not implemented yet`);
      return 0;

    case 'inventory':
      {
        const json = args.includes('--json');
        const unsupportedOption = args.find((arg) => arg !== '--json');
        if (unsupportedOption) {
          io.stderr(`Unknown inventory option: ${unsupportedOption}`);
          return 1;
        }

        const result = await deps.discoverInventory();

        if (result.status !== 'ok') {
          io.stderr(result.message);
          return 2;
        }

        io.stdout(json ? formatInventoryJson(result) : formatInventory(result.profiles));
        return 0;
      }

    case 'daemon':
    case 'chat':
    case 'tui':
      return printNotImplemented(command, io);

    default:
      io.stderr(`Unknown command: ${command}`);
      io.stdout(usage);
      return 1;
  }
}
