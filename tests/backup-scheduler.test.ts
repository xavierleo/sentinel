import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackupScheduler } from '../src/storage/backup-scheduler.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('nightly backup scheduler', () => {
  it('creates a dated SQLite backup when the schedule is due', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-backup-scheduler-'));
    const sourcePath = join(root, 'sentinel.db');
    const backupDir = join(root, 'backups');
    const db = createStateDatabase(sourcePath);
    db.prepare('insert into sessions (id, channel, user_id, created_at, updated_at) values (?, ?, ?, ?, ?)').run(
      'cli:local:default',
      'cli',
      'local',
      1,
      1,
    );
    db.close();

    try {
      const scheduler = createBackupScheduler({
        sourcePath,
        backupDir,
        now: () => Date.UTC(2026, 5, 9, 2, 0, 0),
      });

      const result = await scheduler.runIfDue();

      expect(result).toEqual({
        ran: true,
        backupPath: join(backupDir, 'sentinel-2026-06-09.db'),
        message: 'backup integrity ok',
      });
      expect(await readFile(join(backupDir, 'sentinel-2026-06-09.db'))).toEqual(await readFile(sourcePath));
      expect(await scheduler.runIfDue()).toEqual({ ran: false, message: 'backup already completed for 2026-06-09' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
