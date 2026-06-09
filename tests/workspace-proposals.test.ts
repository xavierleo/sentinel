import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStateDatabase } from '../src/storage/database.js';
import { createProposalQueue } from '../src/workspace/proposals.js';

async function tempRoot() {
  const root = join(tmpdir(), `sentinel-proposals-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const proposalsRoot = join(root, 'proposals');
  await mkdir(root, { recursive: true });
  return { root, proposalsRoot };
}

describe('workspace proposals', () => {
  it('creates, lists, applies, and rejects proposal entries', async () => {
    const { root, proposalsRoot } = await tempRoot();
    const db = createStateDatabase(':memory:');
    try {
      await writeFile(join(root, 'MEMORY.md'), '# MEMORY\n');
      let nextId = 0;
      const queue = createProposalQueue({
        root,
        proposalsRoot,
        db,
        now: () => 1,
        id: () => `1-abcdef1${++nextId}`,
      });

      const proposal = await queue.create({
        sessionId: 'cli:local:default',
        target: 'MEMORY.md',
        kind: 'edit',
        summary: 'Add fact',
        content: '# MEMORY\n- fact\n',
      });

      expect(proposal.id).toBe('1-abcdef11');
      expect((await queue.list()).map((entry) => entry.id)).toEqual(['1-abcdef11']);

      await queue.apply('1-abcdef11');
      await expect(readFile(join(root, 'MEMORY.md'), 'utf8')).resolves.toBe('# MEMORY\n- fact\n');

      const second = await queue.create({
        sessionId: 'cli:local:default',
        target: 'USER.md',
        kind: 'create',
        summary: 'Create user',
        content: '# USER\n',
      });
      await queue.reject(second.id, 'no thanks');
      expect(await queue.list()).toEqual([]);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });

  it('rejects apply when the target changed after proposal creation', async () => {
    const { root, proposalsRoot } = await tempRoot();
    const db = createStateDatabase(':memory:');
    try {
      await writeFile(join(root, 'MEMORY.md'), '# MEMORY\n');
      const queue = createProposalQueue({ root, proposalsRoot, db, now: () => 1, id: () => '1-abcdef12' });
      await queue.create({
        sessionId: 'cli:local:default',
        target: 'MEMORY.md',
        kind: 'edit',
        summary: 'Add fact',
        content: '# MEMORY\n- fact\n',
      });
      await writeFile(join(root, 'MEMORY.md'), '# MEMORY\n- changed\n');

      await expect(queue.apply('1-abcdef12')).rejects.toThrow('target changed');
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });
});
