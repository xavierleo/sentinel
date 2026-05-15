import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../../src/agent/intent-router.js';

describe('intent router', () => {
  it("classifies \"what's running?\" as an inventory summary", () => {
    expect(classifyIntent("what's running?")).toEqual({ kind: 'inventory_summary' });
  });

  it('classifies "what is unhealthy right now?" as inventory unhealthy', () => {
    expect(classifyIntent('what is unhealthy right now?')).toEqual({ kind: 'inventory_unhealthy' });
  });

  it('classifies recent log requests with a container name', () => {
    expect(classifyIntent('show me recent logs for sonarr')).toEqual({
      kind: 'container_logs',
      containerName: 'sonarr',
    });
  });

  it('classifies host status questions as host summary', () => {
    expect(classifyIntent('how is the host doing?')).toEqual({ kind: 'host_summary' });
  });

  it('falls back on ambiguous restart advice', () => {
    expect(classifyIntent('should I restart sonarr?')).toEqual({ kind: 'agent_fallback' });
  });
});
