import type { SentinelConfig } from '../config/schema.js';
import { parseDecision } from './decision-parser.js';
import { classifyIntent } from './intent-router.js';
import { emitTrace, type TurnTraceCallback } from './turn-trace.js';
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
  onTrace?: TurnTraceCallback;
}

type InventoryPayload = {
  counts?: { running?: number; stopped?: number };
  services?: Array<{
    displayName?: string;
    containerName?: string;
    status?: string;
    health?: string;
    ports?: Array<{ host: number; container: number; protocol: string }>;
  }>;
};

type HostStatusPayload = {
  hostname?: string;
  platform?: { kernel?: string };
  uptime?: string;
  memory?: { totalMb?: number; usedMb?: number; freeMb?: number; availableMb?: number };
  rootDisk?: {
    filesystem?: string;
    size?: string;
    used?: string;
    available?: string;
    percentUsed?: string;
    mountpoint?: string;
  };
  docker?: { serverVersion?: string; composeVersion?: string };
};

function summarizeInventory(inventory: unknown): string {
  try {
    return JSON.stringify(inventory);
  } catch {
    return '{"error":"inventory summary unavailable"}';
  }
}

function formatPorts(ports: Array<{ host: number; container: number; protocol: string }> | undefined): string {
  if (!ports || ports.length === 0) {
    return '-';
  }

  return ports.map((port) => `${port.host}:${port.container}/${port.protocol}`).join(', ');
}

function renderInventorySummary(inventory: InventoryPayload): string {
  const counts = inventory.counts ?? {};
  const services = inventory.services ?? [];
  const lines = [
    'Sentinel runtime inventory',
    `Containers: ${counts.running ?? 0} running, ${counts.stopped ?? 0} stopped`,
    '',
  ];

  for (const service of services) {
    lines.push(
      `${service.displayName ?? service.containerName ?? 'Unknown'} | ${service.status ?? 'unknown'} | ${formatPorts(service.ports)}`,
    );
  }

  return lines.join('\n');
}

function renderInventoryUnhealthy(inventory: InventoryPayload): string {
  const services = (inventory.services ?? []).filter((service) => {
    const status = service.status?.toLowerCase();
    const health = service.health?.toLowerCase();
    return status !== 'running' || (health !== undefined && health !== 'healthy');
  });

  const lines = ['Unhealthy containers'];
  if (services.length === 0) {
    lines.push('None');
    return lines.join('\n');
  }

  for (const service of services) {
    lines.push(
      `- ${service.displayName ?? service.containerName ?? 'Unknown'} | status: ${service.status ?? 'unknown'} | health: ${service.health ?? 'unknown'}`,
    );
  }

  return lines.join('\n');
}

function renderContainerLogs(containerName: string, logs: string): string {
  return [`Recent logs for ${containerName}`, logs].join('\n');
}

function renderHostStatus(status: HostStatusPayload): string {
  const memory = status.memory;
  const rootDisk = status.rootDisk;
  const docker = status.docker;

  return [
    'Host status',
    `Hostname: ${status.hostname ?? 'unknown'}`,
    `Platform: ${status.platform?.kernel ?? 'unknown'}`,
    `Uptime: ${status.uptime ?? 'unknown'}`,
    memory
      ? `Memory: ${memory.usedMb ?? 'unknown'}/${memory.totalMb ?? 'unknown'} MB used, ${memory.availableMb ?? 'unknown'} MB available`
      : 'Memory: unknown',
    rootDisk
      ? `Root disk: ${rootDisk.used ?? 'unknown'}/${rootDisk.size ?? 'unknown'} used on ${rootDisk.mountpoint ?? 'unknown'}`
      : 'Root disk: unknown',
    docker
      ? `Docker: server ${docker.serverVersion ?? 'unknown'}, compose ${docker.composeVersion ?? 'unknown'}`
      : 'Docker: unknown',
  ].join('\n');
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
  const { message, config, toolRegistry, callModel, hostname, onTrace } = options;
  const toolNames = toolRegistry.listToolNames();
  const transcript: string[] = [];
  const inventorySummary = await toolRegistry.get('get_runtime_inventory')?.run({});
  let repairAttempts = 0;
  const route = classifyIntent(message);

  emitTrace(onTrace, { type: 'route_selected', route: route.kind });

  if (route.kind === 'inventory_summary') {
    emitTrace(onTrace, { type: 'outcome', outcome: 'routed_response' });
    return renderInventorySummary((inventorySummary ?? {}) as InventoryPayload);
  }

  if (route.kind === 'inventory_unhealthy') {
    emitTrace(onTrace, { type: 'outcome', outcome: 'routed_response' });
    return renderInventoryUnhealthy((inventorySummary ?? {}) as InventoryPayload);
  }

  if (route.kind === 'container_logs') {
    emitTrace(onTrace, { type: 'tool_call', tool: 'container_logs', args: { name: route.containerName } });
    const logs = await toolRegistry.get('container_logs')?.run({ name: route.containerName });
    const renderedLogs = renderContainerLogs(route.containerName, typeof logs === 'string' ? logs : '');
    emitTrace(onTrace, {
      type: 'tool_result',
      tool: 'container_logs',
      preview: renderedLogs,
    });
    emitTrace(onTrace, { type: 'outcome', outcome: 'routed_response' });
    return renderedLogs;
  }

  if (route.kind === 'host_summary') {
    emitTrace(onTrace, { type: 'tool_call', tool: 'host_status', args: {} });
    const hostStatus = (await toolRegistry.get('host_status')?.run({})) as HostStatusPayload | undefined;
    const renderedHostStatus = renderHostStatus(hostStatus ?? {});
    emitTrace(onTrace, {
      type: 'tool_result',
      tool: 'host_status',
      preview: renderedHostStatus,
    });
    emitTrace(onTrace, { type: 'outcome', outcome: 'routed_response' });
    return renderedHostStatus;
  }

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
    emitTrace(onTrace, { type: 'model_raw_output', output: raw });
    let decision;
    try {
      decision = parseDecision(raw);
      repairAttempts = 0;
    } catch (error) {
      repairAttempts += 1;
      emitTrace(onTrace, { type: 'model_parse_error', message: error instanceof Error ? error.message : String(error) });
      if (repairAttempts > config.agent.max_json_repair_attempts) {
        emitTrace(onTrace, { type: 'outcome', outcome: 'safe_failure' });
        return 'I could not finish safely because the model kept returning invalid responses.';
      }
      transcript.push(`MODEL_ERROR: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    transcript.push(`MODEL_DECISION: ${raw}`);

    if (decision.action === 'respond') {
      emitTrace(onTrace, { type: 'outcome', outcome: 'model_response' });
      return decision.response;
    }

    toolCalls += 1;
    emitTrace(onTrace, { type: 'tool_call', tool: decision.tool, args: decision.args });
    const tool = toolRegistry.get(decision.tool);
    if (!tool) {
      transcript.push(
        `TOOL_RESULT: ${JSON.stringify({ tool: decision.tool, error: `Unknown tool: ${decision.tool}` })}`,
      );
      emitTrace(onTrace, { type: 'tool_result', tool: decision.tool, preview: `Unknown tool: ${decision.tool}` });
      continue;
    }

    try {
      const result = await tool.run(decision.args);
      const preview = truncateToolResult(result, config.agent.max_tool_result_chars);
      emitTrace(onTrace, { type: 'tool_result', tool: decision.tool, preview });
      transcript.push(
        `TOOL_RESULT: ${JSON.stringify({
          tool: decision.tool,
          result: preview,
        })}`,
      );
    } catch (error) {
      emitTrace(onTrace, {
        type: 'tool_result',
        tool: decision.tool,
        preview: error instanceof Error ? error.message : String(error),
      });
      transcript.push(
        `TOOL_RESULT: ${JSON.stringify({
          tool: decision.tool,
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );
    }
  }

  emitTrace(onTrace, { type: 'outcome', outcome: 'safe_failure' });
  return 'I could not finish safely because the request exceeded the tool-call limit.';
}
