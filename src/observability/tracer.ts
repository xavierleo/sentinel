export type SpanStatus = 'ok' | 'error';

export interface RecordedSpan {
  id: number;
  parentId: number | null;
  name: string;
  attributes: Record<string, unknown>;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status: SpanStatus;
  error?: string;
}

export interface Tracer {
  withSpan: <T>(name: string, attributes: Record<string, unknown>, fn: () => Promise<T>) => Promise<T>;
  listSpans: () => RecordedSpan[];
}

export function createInMemoryTracer(options: { now?: () => number } = {}): Tracer {
  const now = options.now ?? Date.now;
  const spans: RecordedSpan[] = [];
  const stack: number[] = [];
  let nextId = 1;

  return {
    async withSpan(name, attributes, fn) {
      const id = nextId;
      nextId += 1;
      const parentId = stack.at(-1) ?? null;
      const startedAt = now();
      stack.push(id);

      try {
        const result = await fn();
        const endedAt = now();
        spans.push({
          id,
          parentId,
          name,
          attributes,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          status: 'ok',
        });
        return result;
      } catch (error) {
        const endedAt = now();
        spans.push({
          id,
          parentId,
          name,
          attributes,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        stack.pop();
      }
    },

    listSpans() {
      return [...spans];
    },
  };
}
