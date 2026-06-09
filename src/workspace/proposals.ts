import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { StateDatabase } from '../storage/database.js';
import { commitWorkspace, ensureWorkspaceGit } from './git.js';

export type ProposalKind = 'create' | 'edit' | 'delete';

export interface ProposalMetadata {
  id: string;
  createdAt: number;
  sessionId: string;
  target: string;
  kind: ProposalKind;
  summary: string;
  expiresAt: number;
  baseBlob: string | null;
}

export interface ProposalQueue {
  create: (input: {
    sessionId: string;
    target: string;
    kind: ProposalKind;
    summary: string;
    content: string;
  }) => Promise<ProposalMetadata>;
  list: () => Promise<ProposalMetadata[]>;
  apply: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
  gc: () => Promise<number>;
}

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function safeId(id: string): string {
  const clean = basename(id);
  if (clean !== id || !/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error('Invalid proposal id');
  }
  return id;
}

async function readMaybe(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function recordCreated(db: StateDatabase | undefined, meta: ProposalMetadata) {
  db?.prepare(
    `
      insert into proposals_log (id, kind, target, session_id, created_at)
      values (?, ?, ?, ?, ?)
    `,
  ).run(meta.id, meta.kind, meta.target, meta.sessionId, meta.createdAt);
}

function recordResolved(db: StateDatabase | undefined, id: string, resolution: string, resolvedAt: number) {
  db?.prepare('update proposals_log set resolved_at = ?, resolution = ? where id = ?').run(resolvedAt, resolution, id);
}

export function createProposalQueue(options: {
  root: string;
  proposalsRoot: string;
  db?: StateDatabase;
  now?: () => number;
  id?: () => string;
}): ProposalQueue {
  const now = options.now ?? Date.now;
  const idFactory = options.id ?? (() => `${now()}-${randomUUID().replace(/-/g, '').slice(0, 8)}`);

  async function readMeta(id: string): Promise<ProposalMetadata> {
    return JSON.parse(await readFile(join(options.proposalsRoot, `${safeId(id)}.json`), 'utf8')) as ProposalMetadata;
  }

  async function removeFiles(id: string) {
    await rm(join(options.proposalsRoot, `${safeId(id)}.json`), { force: true });
    await rm(join(options.proposalsRoot, `${safeId(id)}.old`), { force: true });
    await rm(join(options.proposalsRoot, `${safeId(id)}.new`), { force: true });
  }

  return {
    async create(input) {
      await mkdir(options.proposalsRoot, { recursive: true, mode: 0o700 });
      const id = idFactory();
      const current = await readMaybe(join(options.root, input.target));
      const meta: ProposalMetadata = {
        id,
        createdAt: now(),
        sessionId: input.sessionId,
        target: input.target,
        kind: input.kind,
        summary: input.summary.slice(0, 280),
        expiresAt: now() + 7 * 86_400_000,
        baseBlob: current ? sha1(current) : null,
      };
      await writeFile(join(options.proposalsRoot, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
      await writeFile(join(options.proposalsRoot, `${id}.old`), current, { mode: 0o600 });
      await writeFile(join(options.proposalsRoot, `${id}.new`), input.content, { mode: 0o600 });
      recordCreated(options.db, meta);
      return meta;
    },

    async list() {
      await mkdir(options.proposalsRoot, { recursive: true, mode: 0o700 });
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(options.proposalsRoot);
      const metas = await Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .sort()
          .map((file) => readMeta(file.slice(0, -5))),
      );
      return metas;
    },

    async apply(id) {
      const meta = await readMeta(id);
      const target = join(options.root, meta.target);
      const current = await readMaybe(target);
      const currentBlob = current ? sha1(current) : null;
      if (currentBlob !== meta.baseBlob) {
        throw new Error(`Cannot apply proposal ${id}: target changed`);
      }
      const next = await readFile(join(options.proposalsRoot, `${safeId(id)}.new`), 'utf8');
      if (meta.kind === 'delete') {
        await rm(target, { force: true });
      } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, next, { mode: 0o600 });
      }
      recordResolved(options.db, meta.id, 'applied', now());
      await removeFiles(id);
      await ensureWorkspaceGit(options.root);
      await commitWorkspace(options.root, `agent: ${meta.kind} ${meta.target} (approved ${meta.id})\n\n${meta.summary}\n\nSession: ${meta.sessionId}\nAuthor: agent`);
    },

    async reject(id, reason = 'rejected') {
      const meta = await readMeta(id);
      await mkdir(options.proposalsRoot, { recursive: true, mode: 0o700 });
      await appendFile(join(options.proposalsRoot, 'rejected.log'), `${now()} ${id} ${reason}\n`);
      recordResolved(options.db, meta.id, reason, now());
      await removeFiles(id);
    },

    async gc() {
      const proposals = await this.list();
      let removed = 0;
      for (const proposal of proposals) {
        if (proposal.expiresAt <= now()) {
          await this.reject(proposal.id, 'expired');
          removed += 1;
        }
      }
      return removed;
    },
  };
}
