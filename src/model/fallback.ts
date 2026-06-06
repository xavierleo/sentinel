import type { ModelClient, ModelTurnResult } from './types.js';

interface RetryableError extends Error {
  retryable?: boolean;
  status?: number;
}

export interface FallbackModelClientOptions {
  primary: ModelClient;
  fallback: ModelClient;
  resetAfterMs: number;
  now?: () => number;
}

function isRetryableError(error: unknown): boolean {
  const candidate = error as RetryableError;
  return candidate.retryable === true || candidate.status === 429 || (candidate.status !== undefined && candidate.status >= 500);
}

export function createFallbackModelClient(options: FallbackModelClientOptions): ModelClient {
  const now = options.now ?? Date.now;
  let fallbackUntil = 0;

  return {
    async completeTurn(request): Promise<ModelTurnResult> {
      if (now() < fallbackUntil) {
        return options.fallback.completeTurn(request);
      }

      try {
        return await options.primary.completeTurn(request);
      } catch (error) {
        if (!isRetryableError(error)) {
          throw error;
        }

        fallbackUntil = now() + options.resetAfterMs;
        return options.fallback.completeTurn(request);
      }
    },
  };
}
