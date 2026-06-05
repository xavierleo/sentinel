import type { ModelClient, ModelMessage } from '../model/types.js';
import type { PermissionEngine } from '../permissions/types.js';
import type { ToolRegistry } from '../tools/types.js';

export interface RunAgentTurnOptions {
  message: string;
  model: ModelClient;
  tools: ToolRegistry;
  permissions: PermissionEngine;
  maxSteps?: number;
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
  const messages: ModelMessage[] = [{ role: 'user', content: options.message }];

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
      annotations: tool.annotations,
    });

    if (permission.decision !== 'allow') {
      messages.push({
        role: 'tool',
        content: stringifyObservation({ error: `Permission ${permission.decision}`, reason: permission.reason }),
      });
      continue;
    }

    const observation = await options.tools.dispatch(result.name, result.input);
    messages.push({
      role: 'tool',
      content: stringifyObservation(observation),
    });
  }

  throw new Error('Agent turn exceeded max steps');
}
