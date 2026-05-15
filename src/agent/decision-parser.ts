import { ZodError } from 'zod';
import { decisionSchema, type AgentDecision } from './decision-schema.js';

export function parseDecision(raw: string): AgentDecision {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
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
