import type { StateDatabase } from '../storage/database.js';

export interface ModelUsage {
  sessionId: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  costUsd: number;
}

export interface CostSummary {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
  costUsd: number;
}

export function createCostLedger(db: StateDatabase, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const insert = db.prepare(`
    insert into cost_ledger (
      session_id,
      timestamp,
      provider,
      model,
      tokens_in,
      tokens_out,
      cached_tokens_in,
      cost_usd
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    recordModelUsage(usage: ModelUsage): number {
      const result = insert.run(
        usage.sessionId,
        now(),
        usage.provider,
        usage.model,
        usage.tokensIn,
        usage.tokensOut,
        usage.cachedTokensIn,
        usage.costUsd,
      );
      return Number(result.lastInsertRowid);
    },

    summarize(range: { from: number; to: number }): CostSummary {
      const row = db
        .prepare(
          `
            select
              count(*) as calls,
              coalesce(sum(tokens_in), 0) as tokensIn,
              coalesce(sum(tokens_out), 0) as tokensOut,
              coalesce(sum(cached_tokens_in), 0) as cachedTokensIn,
              coalesce(sum(cost_usd), 0) as costUsd
            from cost_ledger
            where timestamp >= ? and timestamp < ?
          `,
        )
        .get(range.from, range.to) as CostSummary;

      return {
        calls: Number(row.calls),
        tokensIn: Number(row.tokensIn),
        tokensOut: Number(row.tokensOut),
        cachedTokensIn: Number(row.cachedTokensIn),
        costUsd: Number(row.costUsd),
      };
    },
  };
}
