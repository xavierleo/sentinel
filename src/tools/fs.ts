import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from './types.js';

const fsListSchema = z.object({
  path: z.string(),
});

const fsReadSchema = z.object({
  path: z.string(),
  range: z
    .object({
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
    })
    .optional(),
});

const fsStatSchema = z.object({
  path: z.string(),
});

const fsSearchSchema = z.object({
  root: z.string(),
  pattern: z.string().min(1),
});

const fsDiskUsageSchema = z.object({
  path: z.string(),
  depth: z.number().int().min(0).default(1),
});

const fsWriteSchema = z.object({
  path: z.string(),
  content: z.string(),
  dry_run: z.boolean().default(true),
});

export interface FsListEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'other';
}

function assertAbsolutePath(toolName: string, path: string): void {
  if (!isAbsolute(path)) {
    throw new Error(`${toolName} requires an absolute path`);
  }
}

function entryType(stats: Awaited<ReturnType<typeof stat>>): FsListEntry['type'] {
  if (stats.isFile()) {
    return 'file';
  }

  if (stats.isDirectory()) {
    return 'directory';
  }

  return 'other';
}

function globPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

async function searchDirectory(root: string, pattern: RegExp, matches: string[]): Promise<void> {
  const names = await readdir(root);
  for (const name of names.sort()) {
    const fullPath = join(root, name);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      await searchDirectory(fullPath, pattern, matches);
      continue;
    }

    if (pattern.test(name)) {
      matches.push(fullPath);
    }
  }
}

async function calculateDiskUsage(path: string, depth: number): Promise<number> {
  const stats = await stat(path);
  if (stats.isFile()) {
    return stats.size;
  }

  if (!stats.isDirectory() || depth <= 0) {
    return 0;
  }

  const names = await readdir(path);
  const sizes = await Promise.all(names.map((name) => calculateDiskUsage(join(path, name), depth - 1)));
  return sizes.reduce((sum, size) => sum + size, 0);
}

export function createFsListTool(): ToolDefinition<z.infer<typeof fsListSchema>, { path: string; entries: FsListEntry[] }> {
  return {
    name: 'fs_list',
    description: 'List entries in an absolute filesystem directory path.',
    schema: fsListSchema,
    annotations: { readOnly: true },
    async execute(args) {
      assertAbsolutePath('fs_list', args.path);

      const names = await readdir(args.path);
      const entries = await Promise.all(
        names.sort().map(async (name) => {
          const fullPath = join(args.path, name);
          const stats = await stat(fullPath);
          return {
            name,
            path: fullPath,
            type: entryType(stats),
          };
        }),
      );

      return { path: args.path, entries };
    },
  };
}

export function createFsStatTool(): ToolDefinition<
  z.infer<typeof fsStatSchema>,
  { path: string; type: FsListEntry['type']; sizeBytes: number; modifiedAt: number }
> {
  return {
    name: 'fs_stat',
    description: 'Return metadata for an absolute filesystem path.',
    schema: fsStatSchema,
    annotations: { readOnly: true },
    async execute(args) {
      assertAbsolutePath('fs_stat', args.path);

      const stats = await stat(args.path);
      return {
        path: args.path,
        type: entryType(stats),
        sizeBytes: stats.size,
        modifiedAt: stats.mtimeMs,
      };
    },
  };
}

export function createFsReadTool(): ToolDefinition<z.infer<typeof fsReadSchema>, { path: string; content: string; truncated: boolean }> {
  return {
    name: 'fs_read',
    description: 'Read a UTF-8 file at an absolute path, optionally returning an inclusive line range.',
    schema: fsReadSchema,
    annotations: { readOnly: true },
    async execute(args) {
      assertAbsolutePath('fs_read', args.path);

      const content = await readFile(args.path, 'utf8');
      if (!args.range) {
        return { path: args.path, content, truncated: false };
      }

      const lines = content.split(/\r?\n/);
      const startIndex = args.range.startLine - 1;
      const endIndex = args.range.endLine;
      return {
        path: args.path,
        content: lines.slice(startIndex, endIndex).join('\n'),
        truncated: false,
      };
    },
  };
}

export function createFsSearchTool(): ToolDefinition<z.infer<typeof fsSearchSchema>, { root: string; matches: string[] }> {
  return {
    name: 'fs_search',
    description: 'Recursively search an absolute directory for filenames matching a simple * wildcard pattern.',
    schema: fsSearchSchema,
    annotations: { readOnly: true },
    async execute(args) {
      assertAbsolutePath('fs_search', args.root);

      const matches: string[] = [];
      await searchDirectory(args.root, globPatternToRegExp(args.pattern), matches);
      return { root: args.root, matches };
    },
  };
}

export function createFsDiskUsageTool(): ToolDefinition<
  z.input<typeof fsDiskUsageSchema>,
  { path: string; sizeBytes: number }
> {
  return {
    name: 'fs_disk_usage',
    description: 'Estimate disk usage for an absolute path up to a bounded directory depth.',
    schema: fsDiskUsageSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = fsDiskUsageSchema.parse(args);
      assertAbsolutePath('fs_disk_usage', parsed.path);

      return {
        path: parsed.path,
        sizeBytes: await calculateDiskUsage(parsed.path, parsed.depth),
      };
    },
  };
}

export function createFsWriteTool(): ToolDefinition<
  z.input<typeof fsWriteSchema>,
  { path: string; dryRun: boolean; written: boolean; bytes: number }
> {
  return {
    name: 'fs_write',
    description: 'Write UTF-8 content to an absolute file path. Defaults to dry-run and requires permission to execute.',
    schema: fsWriteSchema,
    annotations: { destructive: true, idempotent: true },
    async execute(args) {
      const parsed = fsWriteSchema.parse(args);
      assertAbsolutePath('fs_write', parsed.path);

      const bytes = Buffer.byteLength(parsed.content, 'utf8');
      if (parsed.dry_run) {
        return { path: parsed.path, dryRun: true, written: false, bytes };
      }

      await mkdir(dirname(parsed.path), { recursive: true });
      await writeFile(parsed.path, parsed.content, 'utf8');
      return { path: parsed.path, dryRun: false, written: true, bytes };
    },
  };
}
