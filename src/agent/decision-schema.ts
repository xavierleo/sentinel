import { z } from 'zod';

export const respondDecisionSchema = z.object({
  thought: z.string().min(1),
  action: z.literal('respond'),
  response: z.string(),
}).strict();

export const toolCallDecisionSchema = z.object({
  thought: z.string().min(1),
  action: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.unknown()).default({}),
}).strict();

export const decisionSchema = z.discriminatedUnion('action', [
  respondDecisionSchema,
  toolCallDecisionSchema,
]);

export type AgentDecision = z.infer<typeof decisionSchema>;
