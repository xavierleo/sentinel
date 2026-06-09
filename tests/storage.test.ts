import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStateDatabase } from '../src/storage/database.js';
import { createAuditRepository } from '../src/storage/audit.js';

describe('SQLite state storage', () => {
  it('applies migrations for sessions and audit events', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-db-'));
    const dbPath = join(root, 'sentinel.db');

    try {
      const db = createStateDatabase(dbPath);
      const tables = db
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tables).toContain('audit_events');
      expect(tables).toContain('proposals_log');
      expect(tables).toContain('schema_migrations');
      expect(tables).toContain('sessions');
      expect(tables).toContain('skill_uses');
      db.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stores append-only audit events', async () => {
    const db = createStateDatabase(':memory:');
    const audit = createAuditRepository(db, { now: () => 1_717_000_000_000 });

    const id = audit.recordToolAttempt({
      sessionId: 'cli:local:default',
      toolName: 'container_action',
      input: { name: 'sonarr', action: 'restart', dry_run: false },
      permissionDecision: 'ask',
      permissionReason: 'no allow rule matched',
    });

    expect(id).toBe(1);
    expect(audit.listEvents()).toEqual([
      expect.objectContaining({
        id: 1,
        sessionId: 'cli:local:default',
        kind: 'tool_call',
        toolName: 'container_action',
        permissionDecision: 'ask',
      }),
    ]);
    db.close();
  });
});
