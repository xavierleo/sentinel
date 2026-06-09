import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStartupChecks } from '../src/ops/startup-checks.js';
import { runDoctor } from '../src/ops/doctor.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('startup checks', () => {
  it('builds the full doctor check set used by daemon startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-startup-checks-'));
    const backupPath = join(root, 'backup.db');
    const db = createStateDatabase(backupPath);
    db.close();

    try {
      const result = await runDoctor({
        checks: createStartupChecks({
          backupPath,
          hasModelApiKey: true,
        }),
      });

      expect(result.ok).toBe(true);
      expect(result.checks.map((check) => check.name)).toEqual([
        'database',
        'auditLog',
        'backup',
        'model',
        'scheduler',
      ]);
      expect(result.checks.find((check) => check.name === 'backup')).toEqual({
        name: 'backup',
        ok: true,
        message: 'backup integrity ok',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails the backup check when no backup path is configured', async () => {
    const result = await createStartupChecks({ hasModelApiKey: true }).backup?.();

    expect(result).toEqual({
      ok: false,
      message: 'SENTINEL_BACKUP_PATH is not configured',
    });
  });
});
