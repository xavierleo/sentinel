import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStateDatabase } from '../src/storage/database.js';
import {
  createMemoryRemoveTool,
  createMemoryReplaceTool,
  createMemorySetTool,
  createWorkspaceNoteTool,
  createWorkspaceReadTool,
} from '../src/tools/workspace.js';

async function tempWorkspace() {
  const root = join(tmpdir(), `sentinel-tools-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const proposalsRoot = join(root, 'proposals');
  await mkdir(join(root, 'memory'), { recursive: true });
  await writeFile(join(root, 'MEMORY.md'), '# MEMORY\n\n## Topology\n');
  return { root, proposalsRoot };
}

describe('workspace tools', () => {
  it('reads sanitized workspace files', async () => {
    const { root, proposalsRoot } = await tempWorkspace();
    try {
      const tool = createWorkspaceReadTool({ root });
      await expect(tool.execute({ file: 'MEMORY.md' })).resolves.toEqual({
        file: 'MEMORY.md',
        content: '# MEMORY\n\n## Topology\n',
        warnings: [],
      });
      expect(tool.annotations.readOnly).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });

  it('creates proposals for memory edits', async () => {
    const { root, proposalsRoot } = await tempWorkspace();
    const db = createStateDatabase(':memory:');
    try {
      const tool = createMemorySetTool({ root, proposalsRoot, db, sessionId: 'cli:local:default', now: () => 1, id: () => '1-a' });

      await expect(tool.execute({ category: 'Topology', fact: 'Reverse proxy is public.' })).resolves.toEqual({
        proposalId: '1-a',
        target: 'MEMORY.md',
      });

      await expect(readFile(join(proposalsRoot, '1-a.new'), 'utf8')).resolves.toContain('- Reverse proxy is public.');
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });

  it('creates replacement and removal proposals for MEMORY.md', async () => {
    const { root, proposalsRoot } = await tempWorkspace();
    const db = createStateDatabase(':memory:');
    try {
      const replace = createMemoryReplaceTool({ root, proposalsRoot, db, sessionId: 'cli:local:default', now: () => 1, id: () => '1-a' });
      const remove = createMemoryRemoveTool({ root, proposalsRoot, db, sessionId: 'cli:local:default', now: () => 2, id: () => '2-a' });

      await expect(replace.execute({ target: 'Topology', replacement: 'Storage' })).resolves.toEqual({
        proposalId: '1-a',
        target: 'MEMORY.md',
      });
      await expect(remove.execute({ target: 'Topology' })).resolves.toEqual({
        proposalId: '2-a',
        target: 'MEMORY.md',
      });
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });

  it('appends direct daily notes and rejects over-budget logs', async () => {
    const { root, proposalsRoot } = await tempWorkspace();
    try {
      const tool = createWorkspaceNoteTool({
        root,
        nowDate: () => new Date('2026-06-09T12:00:00Z'),
        now: () => 1,
      });

      await expect(tool.execute({ body: 'Observed reverse proxy restart.', tags: ['proxy'] })).resolves.toEqual({
        file: 'memory/2026-06-09.md',
      });
      await expect(readFile(join(root, 'memory', '2026-06-09.md'), 'utf8')).resolves.toContain('[proxy] Observed reverse proxy restart.');

      await writeFile(join(root, 'memory', '2026-06-09.md'), 'a'.repeat(8_000));
      await expect(tool.execute({ body: 'too much' })).rejects.toThrow('memory/2026-06-09.md at');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });
});
