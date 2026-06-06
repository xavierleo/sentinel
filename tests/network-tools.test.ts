import { describe, expect, it, vi } from 'vitest';
import {
  createNetDnsTool,
  createNetListeningPortsTool,
  createNetProbeTool,
  createNetRoutesTool,
} from '../src/tools/network.js';
import { createDefaultToolRegistry } from '../src/tools/index.js';

describe('network tools', () => {
  it('net_probe reports successful TCP connectivity', async () => {
    const probe = vi.fn().mockResolvedValue({ connected: true, latencyMs: 12 });
    const tool = createNetProbeTool({ probe });

    await expect(tool.execute({ host: '127.0.0.1', port: 5432, protocol: 'tcp' })).resolves.toEqual({
      host: '127.0.0.1',
      port: 5432,
      protocol: 'tcp',
      reachable: true,
      latencyMs: 12,
      error: undefined,
    });
    expect(probe).toHaveBeenCalledWith({ host: '127.0.0.1', port: 5432, timeoutMs: 2000 });
  });

  it('net_probe reports failed TCP connectivity without throwing', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('connection refused'));
    const tool = createNetProbeTool({ probe });

    await expect(tool.execute({ host: '127.0.0.1', port: 9 })).resolves.toEqual({
      host: '127.0.0.1',
      port: 9,
      protocol: 'tcp',
      reachable: false,
      latencyMs: undefined,
      error: 'connection refused',
    });
  });

  it('net_dns resolves records through an injected resolver', async () => {
    const resolve = vi.fn().mockResolvedValue(['192.0.2.10']);
    const tool = createNetDnsTool({ resolve });

    await expect(tool.execute({ name: 'example.test', type: 'A' })).resolves.toEqual({
      name: 'example.test',
      type: 'A',
      records: ['192.0.2.10'],
    });
    expect(resolve).toHaveBeenCalledWith('example.test', 'A');
  });

  it('net_listening_ports parses ss output', async () => {
    const execa = vi.fn().mockResolvedValue({
      stdout: [
        'Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
        'tcp   LISTEN 0      4096   0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=100,fd=3))',
        'udp   UNCONN 0      0      127.0.0.1:5353      0.0.0.0:*     users:(("mdns",pid=101,fd=4))',
      ].join('\n'),
    });
    const tool = createNetListeningPortsTool({ execa });

    await expect(tool.execute({})).resolves.toEqual({
      ports: [
        { protocol: 'tcp', address: '0.0.0.0', port: 22, process: 'sshd' },
        { protocol: 'udp', address: '127.0.0.1', port: 5353, process: 'mdns' },
      ],
    });
    expect(execa).toHaveBeenCalledWith('ss', ['-tunlp']);
  });

  it('net_routes parses ip route output', async () => {
    const execa = vi.fn().mockResolvedValue({
      stdout: ['default via 192.168.1.1 dev eth0', '10.0.0.0/24 dev tailscale0 scope link'].join('\n'),
    });
    const tool = createNetRoutesTool({ execa });

    await expect(tool.execute({})).resolves.toEqual({
      routes: [
        { destination: 'default', gateway: '192.168.1.1', device: 'eth0' },
        { destination: '10.0.0.0/24', gateway: undefined, device: 'tailscale0' },
      ],
    });
    expect(execa).toHaveBeenCalledWith('ip', ['route']);
  });

  it('registers network tools in the default registry', () => {
    const names = createDefaultToolRegistry()
      .list()
      .map((tool) => tool.name);

    expect(names).toContain('net_probe');
    expect(names).toContain('net_dns');
    expect(names).toContain('net_listening_ports');
    expect(names).toContain('net_routes');
  });
});
