import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import YAML from 'yaml';
import type { PermissionEngine, PermissionRequest, PermissionResult } from './types.js';

interface PermissionRulesFile {
  deny?: string[];
  allow?: string[];
}

export type PermissionRuleDecision = 'allow' | 'deny';

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

async function readRulesFile(rulesPath: string): Promise<PermissionRulesFile> {
  try {
    const file = YAML.parse(await readFile(rulesPath, 'utf8')) as PermissionRulesFile | null;
    return {
      allow: file?.allow ?? [],
      deny: file?.deny ?? [],
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { allow: [], deny: [] };
    }

    throw error;
  }
}

async function writeRulesFile(rulesPath: string, rules: PermissionRulesFile): Promise<void> {
  await mkdir(dirname(rulesPath), { recursive: true });
  await writeFile(
    rulesPath,
    YAML.stringify({
      allow: rules.allow ?? [],
      deny: rules.deny ?? [],
    }),
  );
}

export async function listPermissionRules(options: { rulesPath: string }): Promise<Required<PermissionRulesFile>> {
  const rules = await readRulesFile(options.rulesPath);
  return {
    allow: rules.allow ?? [],
    deny: rules.deny ?? [],
  };
}

export async function addPermissionRule(options: {
  rulesPath: string;
  decision: PermissionRuleDecision;
  rule: string;
}): Promise<void> {
  parseRule(options.rule);
  const rules = await listPermissionRules({ rulesPath: options.rulesPath });
  const list = rules[options.decision];
  if (!list.includes(options.rule)) {
    list.push(options.rule);
  }

  await writeRulesFile(options.rulesPath, rules);
}

export async function removePermissionRule(options: {
  rulesPath: string;
  decision: PermissionRuleDecision;
  rule: string;
}): Promise<void> {
  const rules = await listPermissionRules({ rulesPath: options.rulesPath });
  rules[options.decision] = rules[options.decision].filter((rule) => rule !== options.rule);
  await writeRulesFile(options.rulesPath, rules);
}

export async function createYamlPermissionEngine(options: {
  rulesPath: string;
  fallback?: PermissionEngine;
}): Promise<PermissionEngine> {
  const file = await readRulesFile(options.rulesPath);
  const deny = (file.deny ?? []).map(parseRule);
  const allow = (file.allow ?? []).map(parseRule);

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

      return options.fallback?.evaluate(request) ?? {
        decision: 'ask',
        reason: 'no permission rule matched',
      };
    },
  };
}
