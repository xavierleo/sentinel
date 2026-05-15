export interface BuildPromptOptions {
  hostname: string;
  userMessage: string;
  inventorySummary: unknown;
  toolNames: string[];
  transcript: string[];
  repairInstruction?: string;
}

function summarizeInventory(inventory: unknown): string {
  try {
    return JSON.stringify(inventory);
  } catch {
    return '{"error":"inventory summary unavailable"}';
  }
}

export function buildPrompt(options: BuildPromptOptions): string {
  const { hostname, userMessage, inventorySummary, toolNames, transcript, repairInstruction } = options;
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
