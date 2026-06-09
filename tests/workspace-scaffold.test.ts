import { access, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldWorkspace } from '../src/workspace/scaffold.js';

describe('workspace scaffold', () => {
  it('creates the workspace skeleton and git metadata', async () => {
    const root = join(tmpdir(), `sentinel-scaffold-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
      const result = await scaffoldWorkspace({ root });

      expect(result.root).toBe(root);
      await expect(access(join(root, 'SOUL.md'))).resolves.toBeUndefined();
      await expect(access(join(root, 'USER.md'))).resolves.toBeUndefined();
      await expect(access(join(root, 'AGENTS.md'))).resolves.toBeUndefined();
      await expect(access(join(root, 'MEMORY.md'))).resolves.toBeUndefined();
      await expect(access(join(root, 'HEARTBEAT.md'))).resolves.toBeUndefined();
      await expect(access(join(root, 'skills'))).resolves.toBeUndefined();
      await expect(access(join(root, 'memory'))).resolves.toBeUndefined();
      await expect(access(join(root, '.git'))).resolves.toBeUndefined();
      await expect(readFile(join(root, '.gitattributes'), 'utf8')).resolves.toContain('*.md text eol=lf');
      expect((await stat(root)).mode & 0o777).toBe(0o700);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
