import { z } from 'zod';
import type { RunConsolidationResult } from '../consolidation/reflection.js';
import type { ToolDefinition } from './types.js';

const consolidateNowSchema = z.object({
  session_id: z.string().min(1).optional(),
});

export function createConsolidateNowTool(options: {
  consolidate: (sessionId?: string) => Promise<RunConsolidationResult>;
}): ToolDefinition<z.input<typeof consolidateNowSchema>, RunConsolidationResult> {
  return {
    name: 'consolidate_now',
    description: 'Run the consolidation reflection hook and create workspace proposals.',
    schema: consolidateNowSchema,
    annotations: { readOnly: false, idempotent: false },
    async execute(args) {
      const parsed = consolidateNowSchema.parse(args);
      return options.consolidate(parsed.session_id);
    },
  };
}

