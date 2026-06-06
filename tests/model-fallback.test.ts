import { describe, expect, it, vi } from 'vitest';
import { createFallbackModelClient } from '../src/model/fallback.js';
import type { ModelClient } from '../src/model/types.js';

describe('provider fallback model client', () => {
  it('falls back to the secondary provider on retryable primary errors', async () => {
    const primary: ModelClient = {
      completeTurn: vi.fn().mockRejectedValue(Object.assign(new Error('rate limited'), { retryable: true })),
    };
    const fallback: ModelClient = {
      completeTurn: vi.fn().mockResolvedValue({ type: 'text', text: 'fallback response' }),
    };
    const client = createFallbackModelClient({ primary, fallback, resetAfterMs: 5 * 60_000 });

    await expect(client.completeTurn({ messages: [], tools: [] })).resolves.toEqual({ type: 'text', text: 'fallback response' });
    expect(fallback.completeTurn).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on non-retryable primary errors', async () => {
    const primary: ModelClient = {
      completeTurn: vi.fn().mockRejectedValue(new Error('bad request')),
    };
    const fallback: ModelClient = {
      completeTurn: vi.fn(),
    };
    const client = createFallbackModelClient({ primary, fallback, resetAfterMs: 5 * 60_000 });

    await expect(client.completeTurn({ messages: [], tools: [] })).rejects.toThrow('bad request');
    expect(fallback.completeTurn).not.toHaveBeenCalled();
  });
});
