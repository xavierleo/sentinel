import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createFsDiskUsageTool,
  createFsListTool,
  createFsReadTool,
  createFsSearchTool,
  createFsStatTool,
  createFsWriteTool,
} from '../src/tools/fs.js';
import { createDefaultToolRegistry } from '../src/tools/index.js';

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

  it('fs_stat returns metadata for absolute paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-fs-stat-'));
    const file = join(root, 'notes.txt');
    await writeFile(file, 'hello');

    try {
      const stat = createFsStatTool();
      await expect(stat.execute({ path: 'notes.txt' })).rejects.toThrow('fs_stat requires an absolute path');
      await expect(stat.execute({ path: file })).resolves.toEqual({
        path: file,
        type: 'file',
        sizeBytes: 5,
        modifiedAt: expect.any(Number),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fs_search finds matching files by glob-like filename pattern', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-fs-search-'));
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'alpha.log'), 'alpha');
    await writeFile(join(root, 'nested', 'beta.log'), 'beta');
    await writeFile(join(root, 'nested', 'gamma.txt'), 'gamma');

    try {
      const search = createFsSearchTool();
      await expect(search.execute({ root: 'relative', pattern: '*.log' })).rejects.toThrow(
        'fs_search requires an absolute path',
      );
      await expect(search.execute({ root, pattern: '*.log' })).resolves.toEqual({
        root,
        matches: [join(root, 'alpha.log'), join(root, 'nested', 'beta.log')],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fs_disk_usage totals file sizes up to the requested depth', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-fs-du-'));
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'alpha.txt'), 'aaaa');
    await writeFile(join(root, 'nested', 'beta.txt'), 'bbbbbb');

    try {
      const diskUsage = createFsDiskUsageTool();
      await expect(diskUsage.execute({ path: 'relative', depth: 1 })).rejects.toThrow(
        'fs_disk_usage requires an absolute path',
      );
      await expect(diskUsage.execute({ path: root, depth: 2 })).resolves.toEqual({
        path: root,
        sizeBytes: 10,
      });
      await expect(diskUsage.execute({ path: root, depth: 0 })).resolves.toEqual({
        path: root,
        sizeBytes: 0,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fs_write defaults to dry-run and writes only when explicitly requested', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-fs-write-'));
    const file = join(root, 'notes.txt');

    try {
      const write = createFsWriteTool();
      await expect(write.execute({ path: 'notes.txt', content: 'hello' })).rejects.toThrow(
        'fs_write requires an absolute path',
      );
      await expect(write.execute({ path: file, content: 'hello' })).resolves.toEqual({
        path: file,
        dryRun: true,
        written: false,
        bytes: 5,
      });
      await expect(readFile(file, 'utf8')).rejects.toThrow();
      await expect(write.execute({ path: file, content: 'hello', dry_run: false })).resolves.toEqual({
        path: file,
        dryRun: false,
        written: true,
        bytes: 5,
      });
      await expect(readFile(file, 'utf8')).resolves.toBe('hello');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers expanded filesystem tools in the default registry', () => {
    const names = createDefaultToolRegistry()
      .list()
      .map((tool) => tool.name);

    expect(names).toContain('fs_stat');
    expect(names).toContain('fs_search');
    expect(names).toContain('fs_disk_usage');
    expect(names).toContain('fs_write');
  });
});
