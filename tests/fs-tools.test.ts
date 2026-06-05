import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFsListTool, createFsReadTool } from '../src/tools/fs.js';

describe('filesystem tools', () => {
  it('fs_list lists absolute paths and rejects relative paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-fs-list-'));
    await writeFile(join(root, 'alpha.txt'), 'alpha');

    try {
      const list = createFsListTool();
      await expect(list.execute({ path: 'relative/path' })).rejects.toThrow('fs_list requires an absolute path');
      await expect(list.execute({ path: root })).resolves.toEqual({
        path: root,
        entries: [
          expect.objectContaining({
            name: 'alpha.txt',
            type: 'file',
          }),
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fs_read reads absolute files with an optional line range', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-fs-read-'));
    const file = join(root, 'notes.txt');
    await writeFile(file, ['one', 'two', 'three'].join('\n'));

    try {
      const read = createFsReadTool();
      await expect(read.execute({ path: 'notes.txt' })).rejects.toThrow('fs_read requires an absolute path');
      await expect(read.execute({ path: file, range: { startLine: 2, endLine: 3 } })).resolves.toEqual({
        path: file,
        content: 'two\nthree',
        truncated: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
