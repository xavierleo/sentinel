import { describe, expect, it, vi } from 'vitest';
import { createConfiguredModelClient } from '../src/model/factory.js';
import type { ModelClient } from '../src/model/types.js';

describe('configured model factory', () => {
  it('uses OpenAI as retry fallback when both providers are configured', async () => {
    const primary: ModelClient = {
      completeTurn: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { retryable: true })),
    };
    const fallback: ModelClient = {
      completeTurn: vi.fn().mockResolvedValue({ type: 'text', text: 'openai fallback' }),
    };

    const client = createConfiguredModelClient({
      anthropicApiKey: 'anthropic',
      openaiApiKey: 'openai',
      createAnthropic: () => primary,
      createOpenAI: () => fallback,
      now: () => 1,
    });

    await expect(client.completeTurn({ messages: [], tools: [] })).resolves.toEqual({
      type: 'text',
      text: 'openai fallback',
    });
    expect(fallback.completeTurn).toHaveBeenCalledTimes(1);
  });

  it('uses Anthropic only when OpenAI fallback is not configured', async () => {
    const primary: ModelClient = {
      completeTurn: vi.fn().mockResolvedValue({ type: 'text', text: 'anthropic' }),
    };

    const client = createConfiguredModelClient({
      anthropicApiKey: 'anthropic',
      createAnthropic: () => primary,
      createOpenAI: () => {
        throw new Error('should not create fallback');
      },
    });

    await expect(client.completeTurn({ messages: [], tools: [] })).resolves.toEqual({
      type: 'text',
      text: 'anthropic',
    });
  });
});
