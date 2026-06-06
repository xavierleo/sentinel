export type BudgetDecision =
  | {
      decision: 'allow';
      warning?: string;
    }
  | {
      decision: 'deny';
      reason: string;
    };

export function evaluateBudgetPolicy(options: { spentUsd: number; softCapUsd: number; hardCapUsd: number }): BudgetDecision {
  if (options.spentUsd >= options.hardCapUsd) {
    return {
      decision: 'deny',
      reason: 'Budget hard cap reached.',
    };
  }

  if (options.spentUsd >= options.softCapUsd) {
    return {
      decision: 'allow',
      warning: 'Budget soft cap reached. Be concise and avoid unnecessary tool calls.',
    };
  }

  return {
    decision: 'allow',
    warning: undefined,
  };
}
