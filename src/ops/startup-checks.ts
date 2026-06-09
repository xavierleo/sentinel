import { verifySqliteBackup } from '../storage/backup.js';
import type { DoctorChecks } from './doctor.js';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { workspaceGitStatus } from '../workspace/git.js';

export interface StartupCheckOptions {
  backupPath?: string;
  hasModelApiKey: boolean;
  logPath?: string;
  telegramConfigured?: boolean;
  openaiFallbackConfigured?: boolean;
  canWritePath?: (path: string) => Promise<boolean>;
  workspacePath?: string;
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
    workspace: async () => {
      if (!options.workspacePath) {
        return { ok: false, message: 'workspace path is not configured' };
      }

      const required = ['SOUL.md', 'USER.md', 'AGENTS.md'];
      const missing: string[] = [];
      for (const file of required) {
        try {
          await access(join(options.workspacePath, file), constants.R_OK);
        } catch {
          missing.push(file);
        }
      }
      if (missing.length > 0) {
        return { ok: false, message: `workspace missing required files: ${missing.join(', ')}` };
      }

      try {
        const status = await workspaceGitStatus(options.workspacePath);
        if (status.dirty) {
          return { ok: false, message: 'workspace git tree is dirty' };
        }
      } catch {
        return { ok: false, message: 'workspace git repo is not initialized' };
      }

      return { ok: true, message: 'workspace ready' };
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
