import type { SentinelConfig } from '../config/schema.js';
import { parseDecision } from './decision-parser.js';
import type { ToolDefinition } from '../tools/index.js';

export interface ChatToolRegistry {
  get(name: string): Readonly<ToolDefinition> | undefined;
  listToolNames(): string[];
}

export interface ChatLoopOptions {
  message: string;
  config: SentinelConfig;
  toolRegistry: ChatToolRegistry;
  callModel: (prompt: string) => Promise<string>;
  hostname: string;
}

function summarizeInventory(inventory: unknown): string {
  try {
    return JSON.stringify(inventory);
  } catch {
    return '{"error":"inventory summary unavailable"}';
  }
}

function buildPrompt(
  hostname: string,
  userMessage: string,
  inventorySummary: unknown,
  toolNames: string[],
  transcript: string[],
  repairInstruction?: string,
): string {
  const sections = [
    `You are Sentinel, a homelab assistant running on ${hostname}.`,
    '',
    'You help the user understand and safely operate their existing Docker-based homelab.',
    '',
    'CURRENT RUNTIME INVENTORY:',
    summarizeInventory(inventorySummary),
    '',
    'RULES:',
    '1. Use the runtime inventory as the source of truth.',
    '2. You may only choose typed tools provided in this request.',
    '3. Never invent shell commands.',
    '4. Admit when something is outside your capability.',
    '',
    'RESPONSE FORMAT:',
    'Return valid JSON only.',
    'Allowed decision actions in v1.x:',
    '- respond',
    '- tool_call',
    '',
    `AVAILABLE TOOLS: ${toolNames.join(', ')}`,
    '',
    `USER MESSAGE: ${userMessage}`,
    '',
    ...transcript,
  ];

  if (repairInstruction) {
    sections.push('', repairInstruction);
  }

  return sections.join('\n');
}

function truncateToolResult(value: unknown, maxChars: number): string {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  if (rendered.length <= maxChars) {
    return rendered;
  }
  return `${rendered.slice(0, maxChars)}...[truncated]`;
}

export async function runChatLoop(options: ChatLoopOptions): Promise<string> {
  const { message, config, toolRegistry, callModel, hostname } = options;
  const toolNames = toolRegistry.listToolNames();
  const transcript: string[] = [];
  const inventorySummary = await toolRegistry.get('get_runtime_inventory')?.run({});
  let repairAttempts = 0;

  for (let toolCalls = 0; toolCalls < config.agent.max_tool_calls_per_request; ) {
    const prompt = buildPrompt(
      hostname,
      message,
      inventorySummary,
      toolNames,
      transcript,
      repairAttempts > 0 ? 'Your previous response was invalid. Return valid JSON matching the required schema only.' : undefined,
    );

    const raw = await callModel(prompt);
    let decision;
    try {
      decision = parseDecision(raw);
      repairAttempts = 0;
    } catch (error) {
      repairAttempts += 1;
      if (repairAttempts > config.agent.max_json_repair_attempts) {
        return 'I could not finish safely because the model kept returning invalid responses.';
      }
      transcript.push(`MODEL_ERROR: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    transcript.push(`MODEL_DECISION: ${raw}`);

    if (decision.action === 'respond') {
      return decision.response;
    }

    toolCalls += 1;
    const tool = toolRegistry.get(decision.tool);
    if (!tool) {
      transcript.push(
        `TOOL_RESULT: ${JSON.stringify({ tool: decision.tool, error: `Unknown tool: ${decision.tool}` })}`,
      );
      continue;
    }

    try {
      const result = await tool.run(decision.args);
      transcript.push(
        `TOOL_RESULT: ${JSON.stringify({
          tool: decision.tool,
          result: truncateToolResult(result, config.agent.max_tool_result_chars),
        })}`,
      );
    } catch (error) {
      transcript.push(
        `TOOL_RESULT: ${JSON.stringify({
          tool: decision.tool,
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );
    }
  }

  return 'I could not finish safely because the request exceeded the tool-call limit.';
}
