import { describe, expect, it } from 'vitest';
import { createInMemoryTracer } from '../src/observability/tracer.js';
import { createCostLedger } from '../src/observability/cost-ledger.js';
import { createStateDatabase } from '../src/storage/database.js';

describe('observability foundations', () => {
  it('records nested spans with attributes and status', async () => {
    const tracer = createInMemoryTracer({ now: (() => {
      let time = 100;
      return () => {
        time += 10;
        return time;
      };
    })() });

    const result = await tracer.withSpan('turn', { sessionId: 'cli:local:default' }, async () =>
      tracer.withSpan('model_call', { model: 'fake' }, async () => 'ok'),
    );

    expect(result).toBe('ok');
    expect(tracer.listSpans()).toEqual([
      expect.objectContaining({ name: 'model_call', parentId: 1, status: 'ok', durationMs: 10 }),
      expect.objectContaining({ name: 'turn', parentId: null, status: 'ok', durationMs: 30 }),
    ]);
  });

  it('records and summarizes model costs', () => {
    const db = createStateDatabase(':memory:');
    const ledger = createCostLedger(db, { now: () => Date.UTC(2026, 5, 6, 10, 0, 0) });

    ledger.recordModelUsage({
      sessionId: 'cli:local:default',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      tokensIn: 1000,
      tokensOut: 200,
      cachedTokensIn: 100,
      costUsd: 0.0123,
    });

    expect(ledger.summarize({ from: Date.UTC(2026, 5, 6), to: Date.UTC(2026, 5, 7) })).toEqual({
      calls: 1,
      tokensIn: 1000,
      tokensOut: 200,
      cachedTokensIn: 100,
      costUsd: 0.0123,
    });
    db.close();
  });
});
