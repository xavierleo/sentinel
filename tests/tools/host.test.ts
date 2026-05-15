import { describe, expect, it } from 'vitest';
import { createHostStatusTool, type HostCommandRunner } from '../../src/tools/host.js';

function createRunner(responses: Record<string, string | Error>): HostCommandRunner {
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

describe('host status tool', () => {
  it('collects a compact host status snapshot from safe system reads', async () => {
    const tool = createHostStatusTool({
      run: createRunner({
        'hostname': 'cerebro\n',
        'uname -srm': 'Linux 6.8.0-60-generic x86_64\n',
        'uptime': ' 17:04:38 up 2 days,  4:12,  2 users,  load average: 0.08, 0.14, 0.17\n',
        'free -m': '               total        used        free      shared  buff/cache   available\nMem:           15861        3120        8450         124        4290       12301\nSwap:           2047           0        2047\n',
        'df -h /': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       916G  210G  660G  25% /\n',
        'docker version --format {{.Server.Version}}': '28.2.2\n',
        'docker compose version --short': '2.35.1\n',
      }),
    });

    await expect(tool()).resolves.toEqual({
      schemaVersion: 1,
      hostname: 'cerebro',
      platform: {
        kernel: 'Linux 6.8.0-60-generic x86_64',
      },
      uptime: '17:04:38 up 2 days,  4:12,  2 users,  load average: 0.08, 0.14, 0.17',
      memory: {
        totalMb: 15861,
        usedMb: 3120,
        freeMb: 8450,
        availableMb: 12301,
      },
      rootDisk: {
        filesystem: '/dev/sda1',
        size: '916G',
        used: '210G',
        available: '660G',
        percentUsed: '25%',
        mountpoint: '/',
      },
      docker: {
        serverVersion: '28.2.2',
        composeVersion: '2.35.1',
      },
    });
  });

  it('returns an unavailable docker section when docker commands fail', async () => {
    const tool = createHostStatusTool({
      run: createRunner({
        'hostname': 'cerebro\n',
        'uname -srm': 'Linux 6.8.0-60-generic x86_64\n',
        'uptime': ' 17:04:38 up 2 days,  4:12,  2 users,  load average: 0.08, 0.14, 0.17\n',
        'free -m': '               total        used        free      shared  buff/cache   available\nMem:           15861        3120        8450         124        4290       12301\nSwap:           2047           0        2047\n',
        'df -h /': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       916G  210G  660G  25% /\n',
        'docker version --format {{.Server.Version}}': Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        'docker compose version --short': Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      }),
    });

    await expect(tool()).resolves.toMatchObject({
      hostname: 'cerebro',
      docker: {
        serverVersion: 'unavailable',
        composeVersion: 'unavailable',
      },
    });
  });
});
