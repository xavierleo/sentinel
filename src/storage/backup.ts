import { copyFile } from 'node:fs/promises';
import { createStateDatabase } from './database.js';

export async function backupSqliteDatabase(options: { sourcePath: string; backupPath: string }): Promise<void> {
  await copyFile(options.sourcePath, options.backupPath);
}

export function verifySqliteBackup(path: string): { ok: boolean; message: string } {
  const db = createStateDatabase(path);

  try {
    const result = db.pragma('integrity_check', { simple: true });
    if (result === 'ok') {
      return { ok: true, message: 'backup integrity ok' };
    }

    return { ok: false, message: `backup integrity failed: ${String(result)}` };
  } finally {
    db.close();
  }
}
