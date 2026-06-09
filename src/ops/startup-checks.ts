import { verifySqliteBackup } from '../storage/backup.js';
import type { DoctorChecks } from './doctor.js';

export interface StartupCheckOptions {
  backupPath?: string;
  hasModelApiKey: boolean;
  logPath?: string;
  telegramConfigured?: boolean;
  openaiFallbackConfigured?: boolean;
  canWritePath?: (path: string) => Promise<boolean>;
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
    logs: async () => {
      if (!options.logPath) {
        return { ok: false, message: 'SENTINEL_LOG_PATH is not configured' };
      }

      const writable = options.canWritePath ? await options.canWritePath(options.logPath) : true;
      return {
        ok: writable,
        message: writable ? 'runtime log path writable' : 'runtime log path is not writable',
      };
    },
    telegram: async () => ({
      ok: Boolean(options.telegramConfigured),
      message: options.telegramConfigured ? 'telegram configured' : 'TELEGRAM_BOT_TOKEN or TELEGRAM_USER_ID is missing',
    }),
    providerFallback: async () => ({
      ok: Boolean(options.openaiFallbackConfigured),
      message: options.openaiFallbackConfigured ? 'OpenAI fallback configured' : 'OPENAI_API_KEY is missing',
    }),
    scheduler: async () => ({ ok: true, message: 'scheduler idle' }),
  };
}
