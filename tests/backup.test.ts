import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStateDatabase } from '../src/storage/database.js';
import { backupSqliteDatabase, verifySqliteBackup } from '../src/storage/backup.js';

describe('SQLite backup verification', () => {
  it('creates a backup and verifies integrity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-backup-'));
    const sourcePath = join(root, 'sentinel.db');
    const backupPath = join(root, 'backup.db');

    try {
      const db = createStateDatabase(sourcePath);
      db.prepare('insert into sessions (id, channel, user_id, created_at, updated_at) values (?, ?, ?, ?, ?)').run(
        'cli:local:default',
        'cli',
        'local',
        1,
        1,
      );
      db.close();

      await backupSqliteDatabase({ sourcePath, backupPath });

      expect(verifySqliteBackup(backupPath)).toEqual({ ok: true, message: 'backup integrity ok' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
