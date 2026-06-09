import type { RecordedSpan, Tracer } from './tracer.js';
import { createInMemoryTracer } from './tracer.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function otlpValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  return { stringValue: String(value) };
}

function spanToOtlp(span: RecordedSpan) {
  return {
    traceId: span.id.toString(16).padStart(32, '0'),
    spanId: span.id.toString(16).padStart(16, '0'),
    parentSpanId: span.parentId ? span.parentId.toString(16).padStart(16, '0') : undefined,
    name: span.name,
    startTimeUnixNano: String(span.startedAt * 1_000_000),
    endTimeUnixNano: String(span.endedAt * 1_000_000),
    attributes: Object.entries(span.attributes).map(([key, value]) => ({ key, value: otlpValue(value) })),
    status: { code: span.status === 'ok' ? 1 : 2, message: span.error ?? '' },
  };
}

export interface OtlpTracer extends Tracer {
  flush: () => Promise<void>;
}

export function createOtlpTracer(options: {
  endpoint: string;
  serviceName: string;
  now?: () => number;
  fetch?: FetchLike;
}): OtlpTracer {
  const tracer = createInMemoryTracer({ now: options.now });
  const fetchImpl = options.fetch ?? fetch;
  let exported = 0;

  return {
    withSpan: tracer.withSpan,
    listSpans: tracer.listSpans,
    async flush() {
      const spans = tracer.listSpans().slice(exported);
      if (spans.length === 0) {
        return;
      }

      const body = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: options.serviceName } }],
            },
            scopeSpans: [
              {
                scope: { name: 'sentinel' },
                spans: spans.map(spanToOtlp),
              },
            ],
          },
        ],
      };

      const response = await fetchImpl(options.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`OTLP export failed: ${response.status}`);
      }
      exported += spans.length;
    },
  };
}
