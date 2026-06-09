import { describe, expect, it, vi } from 'vitest';
import { createLocalRoutingModelClient } from '../src/model/local-routing.js';
import { createOllamaModelClient } from '../src/model/ollama.js';
import type { ModelClient } from '../src/model/types.js';

describe('local model routing', () => {
  it('routes safe simple turns to the local model', async () => {
    const frontier: ModelClient = { completeTurn: vi.fn().mockResolvedValue({ type: 'text', text: 'frontier' }) };
    const local: ModelClient = { completeTurn: vi.fn().mockResolvedValue({ type: 'text', text: 'local' }) };
    const client = createLocalRoutingModelClient({
      frontier,
      local,
      safeToolNames: ['container_list'],
      maxContextChars: 1000,
    });

    await expect(
      client.completeTurn({
        messages: [{ role: 'user', content: 'what containers are running?' }],
        tools: [{ name: 'container_list', description: 'List containers', input_schema: { type: 'object' } }],
      }),
    ).resolves.toEqual({ type: 'text', text: 'local' });
    expect(local.completeTurn).toHaveBeenCalledTimes(1);
    expect(frontier.completeTurn).not.toHaveBeenCalled();
  });

  it('keeps destructive requests on the frontier model', async () => {
    const frontier: ModelClient = { completeTurn: vi.fn().mockResolvedValue({ type: 'text', text: 'frontier' }) };
    const local: ModelClient = { completeTurn: vi.fn() };
    const client = createLocalRoutingModelClient({
      frontier,
      local,
      safeToolNames: ['container_list'],
      maxContextChars: 1000,
    });

    await client.completeTurn({
      messages: [{ role: 'user', content: 'restart the broken container' }],
      tools: [{ name: 'container_list', description: 'List containers', input_schema: { type: 'object' } }],
    });

    expect(frontier.completeTurn).toHaveBeenCalledTimes(1);
    expect(local.completeTurn).not.toHaveBeenCalled();
  });
});

describe('Ollama model adapter', () => {
  it('maps chat responses into the shared model interface', async () => {
    const client = createOllamaModelClient({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      fetch: async () =>
        new Response(JSON.stringify({ message: { content: 'local answer' }, prompt_eval_count: 12, eval_count: 5 }), {
          status: 200,
        }),
    });

    await expect(client.completeTurn({ messages: [{ role: 'user', content: 'hello' }], tools: [] })).resolves.toEqual({
      type: 'text',
      text: 'local answer',
      usage: {
        provider: 'ollama',
        model: 'llama3.1',
        tokensIn: 12,
        tokensOut: 5,
        cachedTokensIn: 0,
        costUsd: 0,
      },
    });
  });
});
