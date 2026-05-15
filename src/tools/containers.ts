import { execa } from 'execa';

export interface DockerLogsResult {
  stdout: string;
}

export type DockerLogsRunner = (command: string, args: string[]) => Promise<DockerLogsResult>;

export interface DockerContainerLogsOptions {
  run?: DockerLogsRunner;
  defaultTailLines?: number;
}

const defaultRunner: DockerLogsRunner = async (command, args) => {
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

export function createDockerContainerLogsTool(options: DockerContainerLogsOptions = {}) {
  const run = options.run ?? defaultRunner;
  const defaultTailLines = options.defaultTailLines ?? 200;

  return async (name: string, lines = defaultTailLines): Promise<string> => {
    try {
      const result = await run('docker', ['logs', '--tail', String(lines), name]);
      return result.stdout;
    } catch (error) {
      if (isDockerMissing(error)) {
        throw new Error('Docker is not installed or is not available on PATH.');
      }

      if (isDaemonUnavailable(error)) {
        throw new Error('Docker daemon is not reachable. Check that Docker is running and that your user can access the Docker socket.');
      }

      throw new Error(`Failed to read logs for container ${name}: ${getErrorMessage(error)}`);
    }
  };
}
