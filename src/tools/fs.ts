import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
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
