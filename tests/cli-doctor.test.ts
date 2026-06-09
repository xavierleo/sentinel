import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli.js';
import { createStateDatabase } from '../src/storage/database.js';

function createHarness() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
    stdout,
    stderr,
  };
}

describe('doctor cli command', () => {
  it('runs doctor through injected dependencies', async () => {
    const harness = createHarness();

    const exitCode = await runCli(['doctor'], harness.io, {
      runDoctor: async () => 'Doctor: ok',
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(['Doctor: ok']);
  });

  it('includes configured backup verification in default doctor output', async () => {
    const harness = createHarness();
    const root = await mkdtemp(join(tmpdir(), 'sentinel-doctor-backup-'));
    const backupPath = join(root, 'backup.db');
    const previousBackupPath = process.env.SENTINEL_BACKUP_PATH;

    try {
      const db = createStateDatabase(backupPath);
      db.close();
      process.env.SENTINEL_BACKUP_PATH = backupPath;

      const exitCode = await runCli(['doctor'], harness.io);

      expect(exitCode).toBe(0);
      expect(harness.stdout.join('\n')).toContain('backup: ok - backup integrity ok');
    } finally {
      if (previousBackupPath === undefined) {
        delete process.env.SENTINEL_BACKUP_PATH;
      } else {
        process.env.SENTINEL_BACKUP_PATH = previousBackupPath;
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
