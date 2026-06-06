import { describe, expect, it, vi } from 'vitest';
import { createContainerActionTool } from '../src/tools/container.js';

describe('container_action tool', () => {
  it('defaults to dry-run and does not call Docker', async () => {
    const execa = vi.fn();
    const tool = createContainerActionTool({ execa });

    await expect(tool.execute({ name: 'sonarr', action: 'restart' })).resolves.toEqual({
      name: 'sonarr',
      action: 'restart',
      dryRun: true,
      executed: false,
    });
    expect(execa).not.toHaveBeenCalled();
  });

  it('executes allowed lifecycle actions when dry_run is false', async () => {
    const execa = vi.fn().mockResolvedValue({ stdout: '' });
    const tool = createContainerActionTool({ execa });

    await expect(tool.execute({ name: 'sonarr', action: 'restart', dry_run: false })).resolves.toEqual({
      name: 'sonarr',
      action: 'restart',
      dryRun: false,
      executed: true,
    });
    expect(execa).toHaveBeenCalledWith('docker', ['restart', 'sonarr']);
  });
});
