import type { SkillSummary } from './registry.js';

export interface SkillTriggerContext {
  cwd?: string;
}

function regexTrigger(trigger: string): RegExp | undefined {
  if (!trigger.startsWith('/') || !trigger.endsWith('/') || trigger.length < 2) {
    return undefined;
  }
  try {
    return new RegExp(trigger.slice(1, -1), 'i');
  } catch {
    return undefined;
  }
}

function pathMatches(pattern: string, cwd: string): boolean {
  if (pattern.endsWith('/**')) {
    return cwd === pattern.slice(0, -3) || cwd.startsWith(pattern.slice(0, -2));
  }
  return cwd === pattern || cwd.startsWith(`${pattern}/`);
}

function skillPathApplies(skill: SkillSummary, cwd?: string): boolean {
  const paths = skill.metadata.paths;
  if (!paths?.length) {
    return true;
  }
  if (!cwd) {
    return false;
  }
  return paths.some((path) => pathMatches(path, cwd));
}

function triggerMatches(message: string, trigger: string): boolean {
  const regex = regexTrigger(trigger);
  if (regex) {
    return regex.test(message);
  }
  if (trigger.startsWith('/') && trigger.endsWith('/')) {
    return false;
  }
  return message.toLowerCase().includes(trigger.toLowerCase());
}

export function matchSkillTriggers(message: string, skills: SkillSummary[], context: SkillTriggerContext = {}): string[] {
  const matched = new Set<string>();
  for (const skill of skills) {
    if (!skillPathApplies(skill, context.cwd)) {
      continue;
    }
    if (skill.metadata.triggers?.some((trigger) => triggerMatches(message, trigger))) {
      matched.add(skill.name);
    }
  }
  return [...matched].sort((a, b) => a.localeCompare(b));
}

