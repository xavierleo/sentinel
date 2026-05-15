import { ZodError } from 'zod';
import { decisionSchema, type AgentDecision } from './decision-schema.js';

function extractBalancedJsonObject(raw: string): string | undefined {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        continue;
      }

      depth -= 1;
      if (depth === 0 && start >= 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function normalizeDecisionJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const fencedBody = fencedMatch[1].trim();
    if (fencedBody.startsWith('{') && fencedBody.endsWith('}')) {
      return fencedBody;
    }
  }

  return extractBalancedJsonObject(trimmed) ?? trimmed;
}

export function parseDecision(raw: string): AgentDecision {
  let parsed: unknown;

  try {
    parsed = JSON.parse(normalizeDecisionJson(raw));
  } catch {
    throw new Error('Invalid JSON decision returned by model');
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'action' in parsed &&
    (parsed as { action: unknown }).action === 'schedule'
  ) {
    throw new Error('Scheduling is not available in Sentinel v1.x');
  }

  try {
    return decisionSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join(', ');
      throw new Error(`Invalid decision shape: ${issues}`);
    }
    throw error;
  }
}
