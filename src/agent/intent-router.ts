export type ChatIntent =
  | { kind: 'inventory_summary' }
  | { kind: 'inventory_unhealthy' }
  | { kind: 'container_logs'; containerName: string }
  | { kind: 'host_summary' }
  | { kind: 'agent_fallback' };

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractContainerName(message: string): string | undefined {
  const match = message.match(/\b(?:logs?|recent logs?)\s+for\s+([a-z0-9][a-z0-9._-]*)\b/i);
  return match?.[1];
}

export function classifyIntent(message: string): ChatIntent {
  const normalized = normalizeMessage(message);

  if (normalized === "what's running?" || normalized === 'what is running?') {
    return { kind: 'inventory_summary' };
  }

  if (normalized === 'what is unhealthy right now?' || normalized === "what's unhealthy right now?") {
    return { kind: 'inventory_unhealthy' };
  }

  if (normalized === 'how is the host doing?') {
    return { kind: 'host_summary' };
  }

  if (/\b(should i|do you think i should|restart|reboot)\b/.test(normalized)) {
    return { kind: 'agent_fallback' };
  }

  const containerName = extractContainerName(normalized);
  if (containerName && /\blogs?\b/.test(normalized)) {
    return { kind: 'container_logs', containerName };
  }

  return { kind: 'agent_fallback' };
}
