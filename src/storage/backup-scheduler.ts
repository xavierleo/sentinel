import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { backupSqliteDatabase, verifySqliteBackup } from './backup.js';

export interface BackupSchedulerResult {
  ran: boolean;
  message: string;
  backupPath?: string;
}

export interface BackupScheduler {
  runIfDue: () => Promise<BackupSchedulerResult>;
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function createBackupScheduler(options: {
  sourcePath: string;
  backupDir: string;
  now?: () => number;
}): BackupScheduler {
  const now = options.now ?? Date.now;
  let lastBackupDate: string | undefined;

  return {
    async runIfDue() {
      const today = dateKey(now());
      if (lastBackupDate === today) {
        return { ran: false, message: `backup already completed for ${today}` };
      }

      await mkdir(options.backupDir, { recursive: true });
      const backupPath = join(options.backupDir, `sentinel-${today}.db`);
      await backupSqliteDatabase({ sourcePath: options.sourcePath, backupPath });
      const verification = verifySqliteBackup(backupPath);
      if (!verification.ok) {
        return { ran: false, backupPath, message: verification.message };
      }

      lastBackupDate = today;
      return { ran: true, backupPath, message: verification.message };
    },
  };
}
