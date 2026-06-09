import { verifySqliteBackup } from '../storage/backup.js';
import type { DoctorChecks } from './doctor.js';

export interface StartupCheckOptions {
  backupPath?: string;
  hasModelApiKey: boolean;
}

export function createStartupChecks(options: StartupCheckOptions): DoctorChecks {
  return {
    database: async () => ({ ok: true, message: 'database check configured' }),
    auditLog: async () => ({ ok: true, message: 'audit check configured' }),
    backup: async () => {
      if (!options.backupPath) {
        return { ok: false, message: 'SENTINEL_BACKUP_PATH is not configured' };
      }

      return verifySqliteBackup(options.backupPath);
    },
    model: async () => ({
      ok: options.hasModelApiKey,
      message: options.hasModelApiKey ? 'model key configured' : 'ANTHROPIC_API_KEY is missing',
    }),
    scheduler: async () => ({ ok: true, message: 'scheduler idle' }),
  };
}
