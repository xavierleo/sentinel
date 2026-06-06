import { describe, expect, it } from 'vitest';
import { evaluateBudgetPolicy } from '../src/observability/budget-policy.js';

describe('budget policy', () => {
  it('allows turns below the soft cap without a warning', () => {
    expect(evaluateBudgetPolicy({ spentUsd: 0.10, softCapUsd: 0.40, hardCapUsd: 0.50 })).toEqual({
      decision: 'allow',
      warning: undefined,
    });
  });

  it('allows turns above the soft cap with a concise warning', () => {
    expect(evaluateBudgetPolicy({ spentUsd: 0.41, softCapUsd: 0.40, hardCapUsd: 0.50 })).toEqual({
      decision: 'allow',
      warning: 'Budget soft cap reached. Be concise and avoid unnecessary tool calls.',
    });
  });

  it('refuses turns at the hard cap', () => {
    expect(evaluateBudgetPolicy({ spentUsd: 0.50, softCapUsd: 0.40, hardCapUsd: 0.50 })).toEqual({
      decision: 'deny',
      reason: 'Budget hard cap reached.',
    });
  });
});
