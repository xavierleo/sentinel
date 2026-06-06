import type { ModelClient, ModelMessage } from '../model/types.js';
import type { PermissionEngine, PermissionResult } from '../permissions/types.js';
import type { AuditSink } from '../storage/audit.js';
import type { ToolDefinition } from '../tools/types.js';
import type { ToolRegistry } from '../tools/types.js';

export interface RunAgentTurnOptions {
  message: string;
  model: ModelClient;
  tools: ToolRegistry;
  permissions: PermissionEngine;
  confirm?: (request: ConfirmationRequest) => Promise<boolean>;
  audit?: AuditSink;
  sessionId?: string;
  memorySummary?: string;
  maxSteps?: number;
}

export interface ConfirmationRequest {
  tool: ToolDefinition;
  input: unknown;
  permission: PermissionResult;
}

export interface AgentTurnResult {
  text: string;
  steps: number;
}

function stringifyObservation(value: unknown): string {
  return JSON.stringify(value);
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const maxSteps = options.maxSteps ?? 8;
  const messages: ModelMessage[] = [
    ...(options.memorySummary ? [{ role: 'system' as const, content: options.memorySummary }] : []),
    { role: 'user', content: options.message },
  ];

  for (let step = 1; step <= maxSteps; step += 1) {
    const result = await options.model.completeTurn({
      messages,
      tools: options.tools.listForModel(),
    });

    if (result.type === 'text') {
      return { text: result.text, steps: step };
    }

    const tool = options.tools.get(result.name);
    if (!tool) {
      messages.push({
        role: 'tool',
        content: stringifyObservation({ error: `Unknown tool: ${result.name}` }),
      });
      continue;
    }

    const permission = options.permissions.evaluate({
      toolName: result.name,
      input: result.input,
      annotations: tool.annotations,
    });

    options.audit?.recordToolAttempt({
      sessionId: options.sessionId ?? 'cli:local:default',
      toolName: result.name,
      input: result.input,
      permissionDecision: permission.decision,
      permissionReason: permission.reason,
    });

    if (permission.decision === 'deny') {
      messages.push({
        role: 'tool',
        content: stringifyObservation({ error: 'Permission deny', reason: permission.reason }),
      });
      continue;
    }

    if (permission.decision === 'ask') {
      const approved = options.confirm ? await options.confirm({ tool, input: result.input, permission }) : false;
      if (!approved) {
        messages.push({
          role: 'tool',
          content: stringifyObservation({ error: 'Permission ask denied', reason: permission.reason }),
        });
        continue;
      }
    }

    const observation = await options.tools.dispatch(result.name, result.input);
    messages.push({
      role: 'tool',
      content: stringifyObservation(observation),
    });
  }

  throw new Error('Agent turn exceeded max steps');
}
