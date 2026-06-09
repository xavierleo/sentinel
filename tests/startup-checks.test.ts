import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStartupChecks } from '../src/ops/startup-checks.js';
import { runDoctor } from '../src/ops/doctor.js';
import { createStateDatabase } from '../src/storage/database.js';
import { scaffoldWorkspace } from '../src/workspace/scaffold.js';

describe('startup checks', () => {
  it('builds the full doctor check set used by daemon startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-startup-checks-'));
    const backupPath = join(root, 'backup.db');
    const workspacePath = join(root, 'workspace');
    const db = createStateDatabase(backupPath);
    db.close();
    await scaffoldWorkspace({ root: workspacePath });

    try {
      const result = await runDoctor({
        checks: createStartupChecks({
          backupPath,
          hasModelApiKey: true,
          logPath: '/var/log/sentinel/sentinel.jsonl',
          telegramConfigured: true,
          openaiFallbackConfigured: true,
          canWritePath: async () => true,
          workspacePath,
        }),
      });

      expect(result.ok).toBe(true);
      expect(result.checks.map((check) => check.name)).toEqual([
        'database',
        'auditLog',
        'backup',
        'model',
        'logs',
        'workspace',
        'telegram',
        'providerFallback',
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

  it('checks production config paths and provider fallback settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-startup-config-'));
    const backupPath = join(root, 'backup.db');
    const db = createStateDatabase(backupPath);
    db.close();

    try {
      const result = await runDoctor({
        checks: createStartupChecks({
          backupPath,
          hasModelApiKey: true,
          logPath: '/var/log/sentinel/sentinel.jsonl',
          telegramConfigured: true,
          openaiFallbackConfigured: true,
          canWritePath: async (path) => path === '/var/log/sentinel/sentinel.jsonl',
        }),
      });

      expect(result.checks).toEqual(
        expect.arrayContaining([
          { name: 'logs', ok: true, message: 'runtime log path writable' },
          { name: 'telegram', ok: true, message: 'telegram configured' },
          { name: 'providerFallback', ok: true, message: 'OpenAI fallback configured' },
        ]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
