import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeLogEntry {
  timestamp: number;
  level: RuntimeLogLevel;
  message: string;
  attributes?: Record<string, unknown>;
}

export interface RuntimeLogger {
  debug: (message: string, attributes?: Record<string, unknown>) => Promise<void>;
  info: (message: string, attributes?: Record<string, unknown>) => Promise<void>;
  warn: (message: string, attributes?: Record<string, unknown>) => Promise<void>;
  error: (message: string, attributes?: Record<string, unknown>) => Promise<void>;
}

const secretPattern = /(api[_-]?key|token|secret|password|credential)/i;

function redactAttributes(attributes: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!attributes) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key, secretPattern.test(key) ? '[redacted]' : value]),
  );
}

export function createJsonlRuntimeLogger(options: { logPath: string; now?: () => number }): RuntimeLogger {
  const now = options.now ?? Date.now;

  async function write(level: RuntimeLogLevel, message: string, attributes?: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(options.logPath), { recursive: true });
    const entry: RuntimeLogEntry = {
      timestamp: now(),
      level,
      message,
      attributes: redactAttributes(attributes),
    };
    await appendFile(options.logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  return {
    debug: (message, attributes) => write('debug', message, attributes),
    info: (message, attributes) => write('info', message, attributes),
    warn: (message, attributes) => write('warn', message, attributes),
    error: (message, attributes) => write('error', message, attributes),
  };
}
