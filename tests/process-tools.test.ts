import { describe, expect, it, vi } from 'vitest';
import {
  createShellExecTool,
  createSystemdActionTool,
  createSystemdListUnitsTool,
  createSystemdStatusTool,
} from '../src/tools/process.js';
import { createDefaultToolRegistry } from '../src/tools/index.js';

describe('process and service tools', () => {
  it('shell_exec defaults to dry-run and only executes when explicitly requested', async () => {
    const execa = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 });
    const tool = createShellExecTool({ execa });

    await expect(tool.execute({ command: 'uptime' })).resolves.toEqual({
      command: 'uptime',
      dryRun: true,
      executed: false,
    });
    expect(execa).not.toHaveBeenCalled();

    await expect(tool.execute({ command: 'uptime', dry_run: false, timeoutMs: 5000 })).resolves.toEqual({
      command: 'uptime',
      dryRun: false,
      executed: true,
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });
    expect(execa).toHaveBeenCalledWith('sh', ['-lc', 'uptime'], { timeout: 5000, reject: false });
  });

  it('systemd_list_units parses systemctl list-units JSON output', async () => {
    const execa = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        {
          unit: 'ssh.service',
          load: 'loaded',
          active: 'active',
          sub: 'running',
          description: 'OpenSSH server',
        },
      ]),
    });
    const tool = createSystemdListUnitsTool({ execa });

    await expect(tool.execute({ state: 'running' })).resolves.toEqual({
      units: [
        {
          name: 'ssh.service',
          load: 'loaded',
          active: 'active',
          sub: 'running',
          description: 'OpenSSH server',
        },
      ],
    });
    expect(execa).toHaveBeenCalledWith('systemctl', [
      'list-units',
      '--type=service',
      '--all',
      '--output=json',
      '--state=running',
    ]);
  });

  it('systemd_status parses systemctl show output', async () => {
    const execa = vi.fn().mockResolvedValue({
      stdout: ['Id=ssh.service', 'LoadState=loaded', 'ActiveState=active', 'SubState=running'].join('\n'),
    });
    const tool = createSystemdStatusTool({ execa });

    await expect(tool.execute({ unit: 'ssh.service' })).resolves.toEqual({
      unit: 'ssh.service',
      loadState: 'loaded',
      activeState: 'active',
      subState: 'running',
    });
    expect(execa).toHaveBeenCalledWith('systemctl', [
      'show',
      'ssh.service',
      '--property=Id,LoadState,ActiveState,SubState',
    ]);
  });

  it('systemd_action defaults to dry-run and executes allowed lifecycle actions when requested', async () => {
    const execa = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const tool = createSystemdActionTool({ execa });

    await expect(tool.execute({ unit: 'ssh.service', action: 'restart' })).resolves.toEqual({
      unit: 'ssh.service',
      action: 'restart',
      dryRun: true,
      executed: false,
    });
    expect(execa).not.toHaveBeenCalled();

    await expect(tool.execute({ unit: 'ssh.service', action: 'restart', dry_run: false })).resolves.toEqual({
      unit: 'ssh.service',
      action: 'restart',
      dryRun: false,
      executed: true,
    });
    expect(execa).toHaveBeenCalledWith('systemctl', ['restart', 'ssh.service'], { reject: false });
  });

  it('registers process and systemd tools in the default registry', () => {
    const names = createDefaultToolRegistry()
      .list()
      .map((tool) => tool.name);

    expect(names).toContain('shell_exec');
    expect(names).toContain('systemd_list_units');
    expect(names).toContain('systemd_status');
    expect(names).toContain('systemd_action');
  });
});
