import { execa } from 'execa';

export interface HostCommandResult {
  stdout: string;
}

export type HostCommandRunner = (command: string, args: string[]) => Promise<HostCommandResult>;

export interface HostStatusToolOptions {
  run?: HostCommandRunner;
}

export interface HostStatusPayload {
  schemaVersion: 1;
  hostname: string;
  platform: {
    kernel: string;
  };
  uptime: string;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
  };
  rootDisk: {
    filesystem: string;
    size: string;
    used: string;
    available: string;
    percentUsed: string;
    mountpoint: string;
  };
  docker: {
    serverVersion: string;
    composeVersion: string;
  };
}

const defaultRunner: HostCommandRunner = async (command, args) => {
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

function isUnavailable(error: unknown): boolean {
  return getErrorCode(error) === 'ENOENT' || getErrorMessage(error).includes('ENOENT');
}

function parseMemory(stdout: string) {
  const memoryLine = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('Mem:'));

  if (!memoryLine) {
    throw new Error('Could not parse memory summary');
  }

  const [, total, used, free, , , available] = memoryLine.split(/\s+/);
  return {
    totalMb: Number(total),
    usedMb: Number(used),
    freeMb: Number(free),
    availableMb: Number(available),
  };
}

function parseRootDisk(stdout: string) {
  const line = stdout
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('Filesystem'));

  if (!line) {
    throw new Error('Could not parse root filesystem usage');
  }

  const [filesystem, size, used, available, percentUsed, mountpoint] = line.split(/\s+/);
  return {
    filesystem,
    size,
    used,
    available,
    percentUsed,
    mountpoint,
  };
}

async function readOptional(run: HostCommandRunner, command: string, args: string[]): Promise<string> {
  try {
    const result = await run(command, args);
    return result.stdout.trim() || 'unavailable';
  } catch (error) {
    if (isUnavailable(error)) {
      return 'unavailable';
    }

    throw new Error(`Failed to read ${command} ${args.join(' ')}: ${getErrorMessage(error)}`);
  }
}

export function createHostStatusTool(options: HostStatusToolOptions = {}) {
  const run = options.run ?? defaultRunner;

  return async (): Promise<HostStatusPayload> => {
    const [hostname, kernel, uptime, memory, rootDisk, dockerVersion, composeVersion] = await Promise.all([
      run('hostname', []).then((result) => result.stdout.trim()),
      run('uname', ['-srm']).then((result) => result.stdout.trim()),
      run('uptime', []).then((result) => result.stdout.trim()),
      run('free', ['-m']).then((result) => parseMemory(result.stdout)),
      run('df', ['-h', '/']).then((result) => parseRootDisk(result.stdout)),
      readOptional(run, 'docker', ['version', '--format', '{{.Server.Version}}']),
      readOptional(run, 'docker', ['compose', 'version', '--short']),
    ]);

    return {
      schemaVersion: 1,
      hostname,
      platform: {
        kernel,
      },
      uptime,
      memory,
      rootDisk,
      docker: {
        serverVersion: dockerVersion,
        composeVersion,
      },
    };
  };
}
