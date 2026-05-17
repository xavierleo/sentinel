import { describe, expect, it, vi } from 'vitest';
import {
  createDockerContainerLogsTool,
  type DockerLogsRunner,
} from '../../src/tools/containers.js';

function createRunner(responses: Record<string, string | Error>): DockerLogsRunner {
  return async (command, args) => {
    const key = [command, ...args].join(' ');
    const response = responses[key];

    if (response instanceof Error) {
      throw response;
    }

    if (response === undefined) {
      throw new Error(`Unexpected command: ${key}`);
    }

    return { stdout: response };
  };
}

describe('container logs tool', () => {
  it('reads recent logs with a default tail size', async () => {
    const tool = createDockerContainerLogsTool({
      run: createRunner({
        'docker logs --tail 200 sonarr': 'line 1\nline 2',
      }),
    });

    await expect(tool('sonarr')).resolves.toBe('line 1\nline 2');
  });

  it('respects a custom tail size', async () => {
    const tool = createDockerContainerLogsTool({
      run: createRunner({
        'docker logs --tail 50 sabnzbd': 'tail output',
      }),
    });

    await expect(tool('sabnzbd', 50)).resolves.toBe('tail output');
  });

  it('forwards an abort signal to the docker runner', async () => {
    const run = vi.fn<DockerLogsRunner>().mockResolvedValue({ stdout: 'tail output' });
    const tool = createDockerContainerLogsTool({ run });
    const controller = new AbortController();

    await expect(tool('sabnzbd', 50, { signal: controller.signal })).resolves.toBe('tail output');

    expect(run).toHaveBeenCalledWith('docker', ['logs', '--tail', '50', 'sabnzbd'], {
      signal: controller.signal,
    });
  });

  it('returns a clear message when Docker is not installed', async () => {
    const tool = createDockerContainerLogsTool({
      run: createRunner({
        'docker logs --tail 200 sonarr': Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      }),
    });

    await expect(tool('sonarr')).rejects.toThrow('Docker is not installed');
  });

  it('returns a clear message when the Docker daemon is unavailable', async () => {
    const tool = createDockerContainerLogsTool({
      run: createRunner({
        'docker logs --tail 200 sonarr': new Error('Cannot connect to the Docker daemon'),
      }),
    });

    await expect(tool('sonarr')).rejects.toThrow('Docker daemon is not reachable');
  });
});
