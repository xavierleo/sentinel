import { describe, expect, it } from 'vitest';
import { createConsolidateNowTool } from '../src/tools/consolidation.js';

describe('consolidation tools', () => {
  it('runs the injected consolidation hook', async () => {
    const tool = createConsolidateNowTool({
      consolidate: async (sessionId = 'cli:local:default') => ({ sessionId, proposals: [{ id: '1-cons1', target: 'MEMORY.md' }] }),
    });

    await expect(tool.execute({ session_id: 'cli:local:chat' })).resolves.toEqual({
      sessionId: 'cli:local:chat',
      proposals: [{ id: '1-cons1', target: 'MEMORY.md' }],
    });
    expect(tool.annotations.readOnly).toBe(false);
  });
});
