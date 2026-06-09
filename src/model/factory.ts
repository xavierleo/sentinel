import { createAnthropicModelClient } from './anthropic.js';
import { createFallbackModelClient } from './fallback.js';
import { createLocalRoutingModelClient } from './local-routing.js';
import { createOllamaModelClient } from './ollama.js';
import { createOpenAIModelClient } from './openai.js';
import type { ModelClient } from './types.js';

export interface ConfiguredModelClientOptions {
  anthropicApiKey: string | undefined;
  openaiApiKey?: string | undefined;
  localModelUrl?: string | undefined;
  localModelName?: string | undefined;
  fallbackResetAfterMs?: number;
  now?: () => number;
  createAnthropic?: (apiKey: string | undefined) => ModelClient;
  createOpenAI?: (apiKey: string | undefined) => ModelClient;
  createLocal?: (baseUrl: string, model?: string) => ModelClient;
}

export function createConfiguredModelClient(options: ConfiguredModelClientOptions): ModelClient {
  const createAnthropic = options.createAnthropic ?? ((apiKey) => createAnthropicModelClient({ apiKey }));
  const createOpenAI = options.createOpenAI ?? ((apiKey) => createOpenAIModelClient({ apiKey }));
  const createLocal = options.createLocal ?? ((baseUrl, model) => createOllamaModelClient({ baseUrl, model }));
  const primary = createAnthropic(options.anthropicApiKey);

  const frontier = options.openaiApiKey
    ? createFallbackModelClient({
        primary,
        fallback: createOpenAI(options.openaiApiKey),
        resetAfterMs: options.fallbackResetAfterMs ?? 5 * 60_000,
        now: options.now,
      })
    : primary;

  if (!options.localModelUrl) {
    return frontier;
  }

  return createLocalRoutingModelClient({
    frontier,
    local: createLocal(options.localModelUrl, options.localModelName),
    safeToolNames: ['memory_search', 'memory_get', 'container_list', 'fs_list', 'net_probe', 'net_dns'],
    maxContextChars: 12_000,
  });
}
