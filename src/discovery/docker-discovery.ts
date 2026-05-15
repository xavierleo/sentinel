import { execa } from 'execa';
import { buildRuntimeProfile, type DockerContainerSummary, type RuntimeServiceProfile } from './runtime-profile.js';

export interface CommandResult {
  stdout: string;
}

export type DockerCommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export type RuntimeInventoryResult =
  | { status: 'ok'; profiles: RuntimeServiceProfile[] }
  | { status: 'docker_unavailable'; message: string }
  | { status: 'daemon_unavailable'; message: string }
  | { status: 'invalid_docker_output'; message: string };

export interface DockerDiscoveryOptions {
  run?: DockerCommandRunner;
}

interface DockerPsRow {
  ID?: unknown;
  Names?: unknown;
  Image?: unknown;
  State?: unknown;
}

interface DockerInspectContainer {
  Id?: unknown;
  Name?: unknown;
  Config?: {
    Image?: unknown;
    Labels?: unknown;
  };
  State?: {
    Status?: unknown;
    Health?: {
      Status?: unknown;
    };
  };
  Created?: unknown;
  HostConfig?: {
    RestartPolicy?: {
      Name?: unknown;
    };
  };
  NetworkSettings?: {
    Ports?: unknown;
    Networks?: unknown;
  };
  Mounts?: unknown;
}

const defaultRunner: DockerCommandRunner = async (command, args) => {
  const result = await execa(command, args);
  return { stdout: result.stdout };
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function isDockerMissing(error: unknown): boolean {
  return getErrorCode(error) === 'ENOENT' || getErrorMessage(error).includes('ENOENT');
}

function isDaemonUnavailable(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('cannot connect to the docker daemon') ||
    message.includes('docker daemon is not running') ||
    message.includes('permission denied while trying to connect to the docker')
  );
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parsePsRows(stdout: string): DockerPsRow[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DockerPsRow);
}

function parseInspect(stdout: string): DockerInspectContainer[] {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('docker inspect did not return an array');
  }
  return parsed as DockerInspectContainer[];
}

function parsePorts(ports: unknown): DockerContainerSummary['ports'] {
  return Object.entries(objectRecord(ports)).flatMap(([containerPort, bindings]) => {
    const [portText, protocolText] = containerPort.split('/');
    const container = Number(portText);
    const protocol = protocolText === 'udp' ? 'udp' : 'tcp';

    if (!Number.isFinite(container) || !Array.isArray(bindings)) {
      return [];
    }

    return bindings.flatMap((binding) => {
      const host = Number(objectRecord(binding).HostPort);
      return Number.isFinite(host) ? [{ host, container, protocol }] : [];
    });
  });
}

function parseMounts(mounts: unknown): DockerContainerSummary['mounts'] {
  if (!Array.isArray(mounts)) {
    return [];
  }

  return mounts.flatMap((mount) => {
    const record = objectRecord(mount);
    const host = stringValue(record.Source);
    const container = stringValue(record.Destination);

    if (!host || !container) {
      return [];
    }

    return [{ host, container, mode: stringValue(record.Mode, 'unknown') }];
  });
}

function parseNetworks(networks: unknown): string[] {
  return Object.keys(objectRecord(networks)).sort();
}

function parseLabels(labels: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objectRecord(labels)).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
  );
}

function toSummary(psRow: DockerPsRow, inspect: DockerInspectContainer): DockerContainerSummary {
  return {
    id: stringValue(inspect.Id, stringValue(psRow.ID)),
    name: stringValue(inspect.Name, stringValue(psRow.Names)),
    image: stringValue(inspect.Config?.Image, stringValue(psRow.Image)),
    state: stringValue(inspect.State?.Status, stringValue(psRow.State, 'unknown')),
    health: typeof inspect.State?.Health?.Status === 'string' ? inspect.State.Health.Status : undefined,
    labels: parseLabels(inspect.Config?.Labels),
    ports: parsePorts(inspect.NetworkSettings?.Ports),
    mounts: parseMounts(inspect.Mounts),
    networks: parseNetworks(inspect.NetworkSettings?.Networks),
    restartPolicy: stringValue(inspect.HostConfig?.RestartPolicy?.Name, 'unknown'),
    createdAt: stringValue(inspect.Created),
  };
}

export async function discoverDockerInventory(options: DockerDiscoveryOptions = {}): Promise<RuntimeInventoryResult> {
  const run = options.run ?? defaultRunner;

  try {
    const psResult = await run('docker', ['ps', '-a', '--format', 'json']);
    const rows = parsePsRows(psResult.stdout);
    const profiles: RuntimeServiceProfile[] = [];

    for (const row of rows) {
      const id = stringValue(row.ID);
      if (!id) {
        continue;
      }

      const inspectResult = await run('docker', ['inspect', id]);
      const [inspect] = parseInspect(inspectResult.stdout);
      if (!inspect) {
        continue;
      }

      profiles.push(buildRuntimeProfile(toSummary(row, inspect)));
    }

    return { status: 'ok', profiles };
  } catch (error) {
    if (isDockerMissing(error)) {
      return { status: 'docker_unavailable', message: 'Docker is not installed or is not available on PATH.' };
    }

    if (isDaemonUnavailable(error)) {
      return {
        status: 'daemon_unavailable',
        message: 'Docker is installed, but the Docker daemon is not reachable. Check that Docker is running and that your user can access the Docker socket.',
      };
    }

    return { status: 'invalid_docker_output', message: getErrorMessage(error) };
  }
}
