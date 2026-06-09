import type { ModelClient, ModelMessage } from './types.js';
import type { ModelToolDefinition } from '../tools/types.js';

const destructivePattern = /\b(restart|stop|start|remove|delete|write|kill|truncate|overwrite|modify)\b/i;

function contextLength(messages: ModelMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function isSafeToolSet(tools: ModelToolDefinition[], safeToolNames: string[]): boolean {
  if (tools.length === 0) {
    return true;
  }

  const safe = new Set(safeToolNames);
  return tools.every((tool) => safe.has(tool.name));
}

export function createLocalRoutingModelClient(options: {
  frontier: ModelClient;
  local: ModelClient;
  safeToolNames: string[];
  maxContextChars: number;
  disabled?: boolean;
}): ModelClient {
  return {
    completeTurn(request) {
      const messageText = request.messages.map((message) => message.content).join('\n');
      const shouldUseLocal =
        !options.disabled &&
        contextLength(request.messages) <= options.maxContextChars &&
        isSafeToolSet(request.tools, options.safeToolNames) &&
        !destructivePattern.test(messageText);

      return shouldUseLocal ? options.local.completeTurn(request) : options.frontier.completeTurn(request);
    },
  };
}
