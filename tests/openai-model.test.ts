import { describe, expect, it } from 'vitest';
import { createOpenAIModelClient } from '../src/model/openai.js';

describe('OpenAI model adapter', () => {
  it('maps a text response into the shared model interface', async () => {
    const requests: unknown[] = [];
    const client = createOpenAIModelClient({
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'fallback answer' }] }],
            usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    await expect(client.completeTurn({ messages: [{ role: 'user', content: 'hello' }], tools: [] })).resolves.toEqual({
      type: 'text',
      text: 'fallback answer',
      usage: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        tokensIn: 100,
        tokensOut: 20,
        cachedTokensIn: 10,
        costUsd: expect.any(Number),
      },
    });
    expect(requests).toEqual([
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content: 'hello' }],
      }),
    ]);
  });

  it('marks rate limits and server errors retryable for provider fallback', async () => {
    const client = createOpenAIModelClient({
      apiKey: 'test-key',
      fetch: async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }),
    });

    await expect(client.completeTurn({ messages: [], tools: [] })).rejects.toMatchObject({
      retryable: true,
      status: 429,
    });
  });
});
