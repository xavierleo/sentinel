import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import type { PermissionEngine, PermissionRequest, PermissionResult } from './types.js';

interface PermissionRulesFile {
  deny?: string[];
  allow?: string[];
}

interface ParsedRule {
  raw: string;
  toolName: string;
  matchers: Record<string, string>;
}

function parseRule(raw: string): ParsedRule {
  const match = /^([a-zA-Z0-9_]+)(?:\((.*)\))?$/.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid permission rule: ${raw}`);
  }

  const matchers: Record<string, string> = {};
  const matcherBody = match[2]?.trim();

  if (matcherBody) {
    for (const part of matcherBody.split(',')) {
      const [key, value] = part.split('=').map((segment) => segment.trim());
      if (!key || value === undefined) {
        throw new Error(`Invalid permission rule matcher: ${raw}`);
      }
      matchers[key] = value;
    }
  }

  return {
    raw,
    toolName: match[1],
    matchers,
  };
}

function inputValue(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const value = (input as Record<string, unknown>)[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value);
}

function matchesRule(rule: ParsedRule, request: PermissionRequest): boolean {
  if (rule.toolName !== request.toolName) {
    return false;
  }

  return Object.entries(rule.matchers).every(([key, expected]) => expected === '*' || inputValue(request.input, key) === expected);
}

export async function createYamlPermissionEngine(options: { rulesPath: string }): Promise<PermissionEngine> {
  const file = YAML.parse(await readFile(options.rulesPath, 'utf8')) as PermissionRulesFile | null;
  const deny = (file?.deny ?? []).map(parseRule);
  const allow = (file?.allow ?? []).map(parseRule);

  return {
    evaluate(request): PermissionResult {
      const denyRule = deny.find((rule) => matchesRule(rule, request));
      if (denyRule) {
        return {
          decision: 'deny',
          reason: `matched deny rule: ${denyRule.raw}`,
        };
      }

      const allowRule = allow.find((rule) => matchesRule(rule, request));
      if (allowRule) {
        return {
          decision: 'allow',
          reason: `matched allow rule: ${allowRule.raw}`,
        };
      }

      return {
        decision: 'ask',
        reason: 'no permission rule matched',
      };
    },
  };
}
