import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const workspaceFileBudgets: Record<string, number> = {
  'SOUL.md': 20_000,
  'MEMORY.md': 2_200,
  'USER.md': 1_375,
  'AGENTS.md': 10_000,
  'HEARTBEAT.md': 800,
};

export const dailyMemoryBudget = 8_000;
export const skillBodyBudget = 100_000;
export const skillSupportFileBudget = 1_048_576;

export function workspaceRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.SENTINEL_WORKSPACE ?? join(homedir(), '.sentinel', 'workspace'));
}

export function proposalsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.SENTINEL_PROPOSALS_PATH ?? join(dirname(workspaceRoot(env)), 'proposals'));
}

export function formatWorkspaceDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function todayMemoryFile(date = new Date()): string {
  return join('memory', `${formatWorkspaceDate(date)}.md`);
}

export function yesterdayMemoryFile(date = new Date()): string {
  const yesterday = new Date(date.getTime() - 86_400_000);
  return todayMemoryFile(yesterday);
}

export function budgetForWorkspaceFile(file: string): number | undefined {
  if (file.startsWith('memory/') && file.endsWith('.md')) {
    return dailyMemoryBudget;
  }

  return workspaceFileBudgets[file];
}

