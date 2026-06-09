import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createJsonlRuntimeLogger } from '../src/observability/runtime-logger.js';

describe('runtime JSONL logger', () => {
  it('writes structured log entries with redacted secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-runtime-logs-'));
    const logPath = join(root, 'sentinel.jsonl');
    const logger = createJsonlRuntimeLogger({ logPath, now: () => 1 });

    try {
      await logger.info('model configured', {
        ANTHROPIC_API_KEY: 'secret',
        TELEGRAM_BOT_TOKEN: 'token',
        command: 'doctor',
      });

      expect((await readFile(logPath, 'utf8')).trim()).toBe(
        JSON.stringify({
          timestamp: 1,
          level: 'info',
          message: 'model configured',
          attributes: {
            ANTHROPIC_API_KEY: '[redacted]',
            TELEGRAM_BOT_TOKEN: '[redacted]',
            command: 'doctor',
          },
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
