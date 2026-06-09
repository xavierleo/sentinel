import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { budgetForWorkspaceFile, todayMemoryFile, yesterdayMemoryFile } from './paths.js';
import { blockedContent, scanThreats } from './threat-scan.js';

export interface WorkspaceReadResult {
  file: string;
  content: string;
  warnings: string[];
}

export interface WorkspaceSnapshot {
  files: {
    SOUL: string;
    USER: string;
    AGENTS: string;
    MEMORY: string;
    HEARTBEAT: string;
    todayLog: string;
    yesterdayLog: string;
  };
  warnings: string[];
  fatalErrors: string[];
}

function assertInsideRoot(root: string, file: string): string {
  const absoluteRoot = resolve(root);
  const absolute = resolve(root, file);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error('Workspace file escapes root');
  }
  return absolute;
}

function truncateContent(file: string, content: string, budget: number): { content: string; warning?: string } {
  if (content.length <= budget) {
    return { content };
  }

  const headLength = Math.floor(budget * 0.7);
  const tailLength = Math.floor(budget * 0.2);
  const elided = content.length - headLength - tailLength;
  return {
    content: `${content.slice(0, headLength)}[... ${elided} chars elided by truncation ...]${content.slice(-tailLength)}`,
    warning: `${file} exceeds budget (${content.length}/${budget}); prompt content was truncated`,
  };
}

export async function readWorkspaceFile(options: { root: string; file: string }): Promise<WorkspaceReadResult> {
  const absolute = assertInsideRoot(options.root, options.file);
  const budget = budgetForWorkspaceFile(options.file);
  const original = await readFile(absolute, 'utf8');
  const threats = scanThreats(original);
  if (threats.length > 0) {
    return { file: options.file, content: blockedContent(options.file, threats), warnings: [] };
  }
  const truncated = budget ? truncateContent(options.file, original, budget) : { content: original };
  return {
    file: options.file,
    content: truncated.content,
    warnings: truncated.warning ? [truncated.warning] : [],
  };
}

export function validateWorkspaceWrite(file: string, content: string): { success: true } | { success: false; error: string } {
  const budget = budgetForWorkspaceFile(file);
  if (budget && content.length > budget) {
    return {
      success: false,
      error: `${file} at ${content.length}/${budget} chars. Consolidate or replace entries before adding.`,
    };
  }

  return { success: true };
}

async function loadOptional(root: string, file: string, warnings: string[]): Promise<string> {
  try {
    const result = await readWorkspaceFile({ root, file });
    warnings.push(...result.warnings);
    return result.content;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      warnings.push(`${file} missing`);
      return '';
    }
    throw error;
  }
}

async function loadRequired(root: string, file: string, fatalErrors: string[], warnings: string[]): Promise<string> {
  try {
    const result = await readWorkspaceFile({ root, file });
    warnings.push(...result.warnings);
    return result.content;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      fatalErrors.push(`${file} missing`);
      return '';
    }
    throw error;
  }
}

export async function loadWorkspaceSnapshot(options: { root: string; now?: Date }): Promise<WorkspaceSnapshot> {
  const warnings: string[] = [];
  const fatalErrors: string[] = [];
  const now = options.now ?? new Date();

  return {
    files: {
      SOUL: await loadRequired(options.root, 'SOUL.md', fatalErrors, warnings),
      USER: await loadRequired(options.root, 'USER.md', fatalErrors, warnings),
      AGENTS: await loadRequired(options.root, 'AGENTS.md', fatalErrors, warnings),
      MEMORY: await loadOptional(options.root, 'MEMORY.md', warnings),
      HEARTBEAT: await loadOptional(options.root, 'HEARTBEAT.md', warnings),
      todayLog: await loadOptional(options.root, todayMemoryFile(now), warnings),
      yesterdayLog: await loadOptional(options.root, yesterdayMemoryFile(now), warnings),
    },
    warnings,
    fatalErrors,
  };
}

