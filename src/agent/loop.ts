import type { ModelClient, ModelMessage } from '../model/types.js';
import type { Tracer } from '../observability/tracer.js';
import type { PermissionEngine, PermissionResult } from '../permissions/types.js';
import type { SessionRepository } from '../sessions/repository.js';
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
  sessions?: SessionRepository;
  memorySummary?: string;
  tracer?: Tracer;
  reflection?: ReflectionSink;
  maxSteps?: number;
}

export interface ConfirmationRequest {
  tool: ToolDefinition;
  input: unknown;
  permission: PermissionResult;
}

export interface ReflectionSink {
  summarize: (result: { userMessage: string; finalText: string }) => Promise<string | undefined>;
  recordNote: (body: string) => Promise<void>;
}

export interface AgentTurnResult {
  text: string;
  steps: number;
}

function stringifyObservation(value: unknown): string {
  return JSON.stringify(value);
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  if (options.tracer) {
    return options.tracer.withSpan('turn', { sessionId: options.sessionId ?? 'cli:local:default' }, () =>
      executeAgentTurn(options),
    );
  }

  return executeAgentTurn(options);
}

async function executeAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const maxSteps = options.maxSteps ?? 8;
  const sessionId = options.sessionId ?? 'cli:local:default';
  const stepId = `${Date.now()}`;
  if (options.sessions) {
    const [channel = 'cli', userId = 'local'] = sessionId.split(':');
    options.sessions.ensureSession({ id: sessionId, channel, userId });
    options.sessions.appendMessage({ sessionId, role: 'user', content: options.message });
    options.sessions.markStepStarted({ sessionId, stepId });
  }
  const messages: ModelMessage[] = [
    ...(options.memorySummary ? [{ role: 'system' as const, content: options.memorySummary }] : []),
    { role: 'user', content: options.message },
  ];

  for (let step = 1; step <= maxSteps; step += 1) {
    const modelCall = () =>
      options.model.completeTurn({
        messages,
        tools: options.tools.listForModel(),
      });
    const result = options.tracer
      ? await options.tracer.withSpan('model_call', { step }, modelCall)
      : await modelCall();

    if (result.type === 'text') {
      if (options.reflection) {
        const note = await options.reflection.summarize({ userMessage: options.message, finalText: result.text });
        if (note?.trim()) {
          await options.reflection.recordNote(note.trim());
        }
      }
      options.sessions?.appendMessage({ sessionId, role: 'assistant', content: result.text });
      options.sessions?.markStepCompleted({ sessionId, stepId });
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

    const dispatch = () => options.tools.dispatch(result.name, result.input);
    const observation = options.tracer
      ? await options.tracer.withSpan('tool_dispatch', { toolName: result.name }, dispatch)
      : await dispatch();
    messages.push({
      role: 'tool',
      content: stringifyObservation(observation),
    });
  }

  throw new Error('Agent turn exceeded max steps');
}
