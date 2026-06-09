import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { StateDatabase } from '../storage/database.js';
import { readWorkspaceFile, validateWorkspaceWrite } from '../workspace/loader.js';
import { todayMemoryFile } from '../workspace/paths.js';
import { createProposalQueue } from '../workspace/proposals.js';
import { scanThreats } from '../workspace/threat-scan.js';
import { commitWorkspace, ensureWorkspaceGit } from '../workspace/git.js';
import type { ToolDefinition } from './types.js';

const workspaceReadSchema = z.object({
  file: z.string().min(1),
});

const memorySetSchema = z.object({
  category: z.string().min(1),
  fact: z.string().min(1),
});

const memoryReplaceSchema = z.object({
  target: z.string().min(1),
  replacement: z.string(),
});

const memoryRemoveSchema = z.object({
  target: z.string().min(1),
});

const proposeEditSchema = z.object({
  diff: z.string().min(1),
});

const workspaceProposeEditSchema = z.object({
  file: z.enum(['SOUL.md', 'AGENTS.md', 'HEARTBEAT.md']),
  diff: z.string().min(1),
});

const workspaceNoteSchema = z.object({
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

interface WorkspaceToolOptions {
  root: string;
  proposalsRoot: string;
  db?: StateDatabase;
  sessionId?: string;
  now?: () => number;
  nowDate?: () => Date;
  id?: () => string;
}

function queue(options: WorkspaceToolOptions) {
  return createProposalQueue({
    root: options.root,
    proposalsRoot: options.proposalsRoot,
    db: options.db,
    now: options.now,
    id: options.id,
  });
}

function rejectThreats(content: string) {
  const threats = scanThreats(content);
  if (threats.length > 0) {
    throw new Error(`Content rejected by threat scanner: ${threats.map((threat) => threat.category).join(', ')}`);
  }
}

async function readMemory(root: string): Promise<string> {
  try {
    return await readFile(join(root, 'MEMORY.md'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return '# MEMORY\n';
    }
    throw error;
  }
}

function appendMemoryFact(memory: string, category: string, fact: string): string {
  const heading = `## ${category}`;
  const line = `- ${fact}`;
  if (memory.includes(heading)) {
    return memory.replace(heading, `${heading}\n${line}`);
  }
  return `${memory.trimEnd()}\n\n${heading}\n${line}\n`;
}

async function createMemoryProposal(
  options: WorkspaceToolOptions,
  summary: string,
  content: string,
): Promise<{ proposalId: string; target: string }> {
  rejectThreats(content);
  const validation = validateWorkspaceWrite('MEMORY.md', content);
  if (!validation.success) {
    throw new Error(validation.error);
  }
  const proposal = await queue(options).create({
    sessionId: options.sessionId ?? 'cli:local:default',
    target: 'MEMORY.md',
    kind: 'edit',
    summary,
    content,
  });
  return { proposalId: proposal.id, target: 'MEMORY.md' };
}

export function createWorkspaceReadTool(options: { root: string }): ToolDefinition<
  z.input<typeof workspaceReadSchema>,
  Awaited<ReturnType<typeof readWorkspaceFile>>
> {
  return {
    name: 'workspace_read',
    description: 'Read a Sentinel workspace file after budget and threat scanning.',
    schema: workspaceReadSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = workspaceReadSchema.parse(args);
      return readWorkspaceFile({ root: options.root, file: parsed.file });
    },
  };
}

export function createMemorySetTool(options: WorkspaceToolOptions): ToolDefinition<
  z.input<typeof memorySetSchema>,
  { proposalId: string; target: string }
> {
  return {
    name: 'memory_set',
    description: 'Propose adding a curated fact to MEMORY.md under a category.',
    schema: memorySetSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = memorySetSchema.parse(args);
      return createMemoryProposal(options, `Add MEMORY.md fact: ${parsed.category}`, appendMemoryFact(await readMemory(options.root), parsed.category, parsed.fact));
    },
  };
}

export function createMemoryReplaceTool(options: WorkspaceToolOptions): ToolDefinition<
  z.input<typeof memoryReplaceSchema>,
  { proposalId: string; target: string }
> {
  return {
    name: 'memory_replace',
    description: 'Propose replacing an exact substring in MEMORY.md.',
    schema: memoryReplaceSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = memoryReplaceSchema.parse(args);
      const memory = await readMemory(options.root);
      if (!memory.includes(parsed.target)) {
        throw new Error('Target substring not found in MEMORY.md');
      }
      return createMemoryProposal(options, 'Replace MEMORY.md substring', memory.replace(parsed.target, parsed.replacement));
    },
  };
}

export function createMemoryRemoveTool(options: WorkspaceToolOptions): ToolDefinition<
  z.input<typeof memoryRemoveSchema>,
  { proposalId: string; target: string }
> {
  return {
    name: 'memory_remove',
    description: 'Propose removing an exact substring from MEMORY.md.',
    schema: memoryRemoveSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = memoryRemoveSchema.parse(args);
      const memory = await readMemory(options.root);
      if (!memory.includes(parsed.target)) {
        throw new Error('Target substring not found in MEMORY.md');
      }
      return createMemoryProposal(options, 'Remove MEMORY.md substring', memory.replace(parsed.target, ''));
    },
  };
}

export function createUserProposeEditTool(options: WorkspaceToolOptions): ToolDefinition<
  z.input<typeof proposeEditSchema>,
  { proposalId: string; target: string }
> {
  return {
    name: 'user_propose_edit',
    description: 'Propose a replacement edit for USER.md. The content is queued for user approval.',
    schema: proposeEditSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = proposeEditSchema.parse(args);
      rejectThreats(parsed.diff);
      const validation = validateWorkspaceWrite('USER.md', parsed.diff);
      if (!validation.success) {
        throw new Error(validation.error);
      }
      const proposal = await queue(options).create({
        sessionId: options.sessionId ?? 'cli:local:default',
        target: 'USER.md',
        kind: 'edit',
        summary: 'Propose USER.md edit',
        content: parsed.diff,
      });
      return { proposalId: proposal.id, target: 'USER.md' };
    },
  };
}

export function createWorkspaceProposeEditTool(options: WorkspaceToolOptions): ToolDefinition<
  z.input<typeof workspaceProposeEditSchema>,
  { proposalId: string; target: string }
> {
  return {
    name: 'workspace_propose_edit',
    description: 'Propose a replacement edit for SOUL.md, AGENTS.md, or HEARTBEAT.md.',
    schema: workspaceProposeEditSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = workspaceProposeEditSchema.parse(args);
      rejectThreats(parsed.diff);
      const validation = validateWorkspaceWrite(parsed.file, parsed.diff);
      if (!validation.success) {
        throw new Error(validation.error);
      }
      const proposal = await queue(options).create({
        sessionId: options.sessionId ?? 'cli:local:default',
        target: parsed.file,
        kind: 'edit',
        summary: `Propose ${parsed.file} edit`,
        content: parsed.diff,
      });
      return { proposalId: proposal.id, target: parsed.file };
    },
  };
}

export function createWorkspaceNoteTool(options: Pick<WorkspaceToolOptions, 'root' | 'now' | 'nowDate'>): ToolDefinition<
  z.input<typeof workspaceNoteSchema>,
  { file: string }
> {
  return {
    name: 'workspace_note',
    description: "Append a raw observation to today's workspace daily memory log.",
    schema: workspaceNoteSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = workspaceNoteSchema.parse(args);
      rejectThreats(parsed.body);
      const date = options.nowDate?.() ?? new Date();
      const file = todayMemoryFile(date);
      const tagPrefix = parsed.tags?.length ? `[${parsed.tags.join(',')}] ` : '';
      const line = `- ${new Date(options.now?.() ?? Date.now()).toISOString()} ${tagPrefix}${parsed.body}\n`;
      let current = '';
      try {
        current = await readFile(join(options.root, file), 'utf8');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
      const validation = validateWorkspaceWrite(file, `${current}${line}`);
      if (!validation.success) {
        throw new Error(validation.error);
      }
      await mkdir(join(options.root, 'memory'), { recursive: true, mode: 0o700 });
      await appendFile(join(options.root, file), line, { mode: 0o600 });
      await ensureWorkspaceGit(options.root);
      await commitWorkspace(options.root, `agent: note ${file}\n\nWorkspace note appended.\n\nAuthor: agent`);
      return { file };
    },
  };
}
