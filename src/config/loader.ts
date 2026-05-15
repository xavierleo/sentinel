import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { defaultConfig } from './defaults.js';
import { sentinelConfigSchema, type SentinelConfig } from './schema.js';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) {
    return override === undefined ? base : (override as T);
  }

  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeDeep((base as JsonObject)[key], value);
  }
  return merged as T;
}

export function loadConfigFromString(source: string): SentinelConfig {
  const parsed = YAML.parse(source) ?? {};
  const merged = mergeDeep(defaultConfig, parsed);
  return sentinelConfigSchema.parse(merged);
}

export async function loadConfig(path = '/etc/sentinel/sentinel.yml'): Promise<SentinelConfig> {
  const source = await readFile(path, 'utf8');
  return loadConfigFromString(source);
}
