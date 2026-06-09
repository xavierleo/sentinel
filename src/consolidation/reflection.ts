import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { ModelClient, ModelMessage } from '../model/types.js';
import type { StateDatabase } from '../storage/database.js';
import { validateWorkspaceWrite } from '../workspace/loader.js';
import { createProposalQueue } from '../workspace/proposals.js';
import { scanThreats } from '../workspace/threat-scan.js';

const memoryEntrySchema = z.object({
  category: z.string().min(1),
  fact: z.string().min(1),
  quote: z.string().min(1),
});

const userEntrySchema = z.object({
  fact: z.string().min(1),
  quote: z.string().min(1),
});

const skillEntrySchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  description: z.string().min(1).max(1024),
  triggers: z.array(z.string()).default([]),
  body: z.string().min(1).max(100_000),
});

const reflectionSchema = z.object({
  memory: z.array(memoryEntrySchema).default([]),
  user: z.array(userEntrySchema).default([]),
  skills: z.array(skillEntrySchema).default([]),
});

export type ConsolidationReflection = z.infer<typeof reflectionSchema>;

export interface ConsolidationProposalResult {
  proposals: { id: string; target: string }[];
}

export interface RunConsolidationResult extends ConsolidationProposalResult {
  sessionId: string;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Consolidation output must be valid JSON');
  }
}

function assertQuoteInTranscript(kind: string, quote: string, transcript: string) {
  if (!transcript.includes(quote)) {
    throw new Error(`${kind} quote was not found in transcript`);
  }
}

function rejectThreats(content: string) {
  const threats = scanThreats(content);
  if (threats.length > 0) {
    throw new Error(`Consolidation content rejected by threat scanner: ${threats.map((threat) => threat.category).join(', ')}`);
  }
}

export function parseConsolidationReflection(text: string, transcript: string): ConsolidationReflection {
  const parsed = reflectionSchema.parse(parseJson(text));
  for (const entry of parsed.memory) {
    assertQuoteInTranscript('memory', entry.quote, transcript);
    rejectThreats(entry.fact);
  }
  for (const entry of parsed.user) {
    assertQuoteInTranscript('user', entry.quote, transcript);
    rejectThreats(entry.fact);
  }
  for (const skill of parsed.skills) {
    rejectThreats(skill.body);
  }
  return parsed;
}

async function readMaybe(path: string, fallback: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function appendMemory(memory: string, entries: ConsolidationReflection['memory']): string {
  let next = memory;
  for (const entry of entries) {
    const heading = `## ${entry.category}`;
    const line = `- ${entry.fact}`;
    if (next.includes(heading)) {
      next = next.replace(heading, `${heading}\n${line}`);
    } else {
      next = `${next.trimEnd()}\n\n${heading}\n${line}\n`;
    }
  }
  return next;
}

function appendUserFacts(user: string, entries: ConsolidationReflection['user']): string {
  if (entries.length === 0) {
    return user;
  }
  const heading = '## Operator-taught';
  const lines = entries.map((entry) => `- ${entry.fact}`).join('\n');
  if (user.includes(heading)) {
    return user.replace(heading, `${heading}\n${lines}`);
  }
  return `${user.trimEnd()}\n\n${heading}\n${lines}\n`;
}

function skillContent(skill: ConsolidationReflection['skills'][number]): string {
  const triggers = skill.triggers.length > 0 ? `triggers:\n${skill.triggers.map((trigger) => `  - ${JSON.stringify(trigger)}`).join('\n')}\n` : '';
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n${triggers}status: proposed\ncreated_by: agent\n---\n${skill.body.trim()}\n`;
}

async function createProposal(options: {
  root: string;
  proposalsRoot: string;
  db?: StateDatabase;
  sessionId: string;
  now?: () => number;
  id?: () => string;
  target: string;
  summary: string;
  content: string;
}) {
  const validation = validateWorkspaceWrite(options.target, options.content);
  if (!validation.success) {
    throw new Error(validation.error);
  }
  await mkdir(dirname(join(options.root, options.target)), { recursive: true });
  const proposal = await createProposalQueue(options).create({
    sessionId: options.sessionId,
    target: options.target,
    kind: 'edit',
    summary: options.summary,
    content: options.content,
  });
  return { id: proposal.id, target: proposal.target };
}

export async function createConsolidationProposals(options: {
  root: string;
  proposalsRoot: string;
  db?: StateDatabase;
  sessionId: string;
  reflection: ConsolidationReflection;
  now?: () => number;
  id?: () => string;
}): Promise<ConsolidationProposalResult> {
  const proposals: { id: string; target: string }[] = [];

  if (options.reflection.memory.length > 0) {
    const memory = await readMaybe(join(options.root, 'MEMORY.md'), '# MEMORY\n');
    proposals.push(
      await createProposal({
        ...options,
        target: 'MEMORY.md',
        summary: `Consolidate ${options.reflection.memory.length} memory entr${options.reflection.memory.length === 1 ? 'y' : 'ies'}`,
        content: appendMemory(memory, options.reflection.memory),
      }),
    );
  }

  if (options.reflection.user.length > 0) {
    const user = await readMaybe(join(options.root, 'USER.md'), '# USER\n');
    proposals.push(
      await createProposal({
        ...options,
        target: 'USER.md',
        summary: `Consolidate ${options.reflection.user.length} user entr${options.reflection.user.length === 1 ? 'y' : 'ies'}`,
        content: appendUserFacts(user, options.reflection.user),
      }),
    );
  }

  for (const skill of options.reflection.skills) {
    proposals.push(
      await createProposal({
        ...options,
        target: `skills/${skill.name}/SKILL.md`,
        summary: `Propose skill: ${skill.name}`,
        content: skillContent(skill),
      }),
    );
  }

  return { proposals };
}

export function buildConsolidationMessages(transcript: string): ModelMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are reviewing a finished Sentinel session. Propose durable MEMORY.md, USER.md, or SKILL.md additions. Output JSON only: { "memory": [], "user": [], "skills": [] }. Every memory/user entry must include an exact quote from the transcript.',
    },
    { role: 'user', content: transcript },
  ];
}

export async function runConsolidation(options: {
  model: ModelClient;
  transcript: string;
  root: string;
  proposalsRoot: string;
  sessionId: string;
  db?: StateDatabase;
}): Promise<RunConsolidationResult> {
  const result = await options.model.completeTurn({ messages: buildConsolidationMessages(options.transcript), tools: [] });
  if (result.type !== 'text') {
    throw new Error('Consolidation model must return text JSON');
  }
  const reflection = parseConsolidationReflection(result.text, options.transcript);
  const proposals = await createConsolidationProposals({ ...options, reflection });
  return { sessionId: options.sessionId, proposals: proposals.proposals };
}

