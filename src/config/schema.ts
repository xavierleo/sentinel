import { z } from 'zod';

const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'refresh_interval must look like 30s, 5m, 1h, or 1d');

export const sentinelConfigSchema = z.object({
  agent: z.object({
    model: z.string().min(1),
    model_profile: z.enum(['fast', 'balanced', 'smarter']),
    ollama_url: z.string().url(),
    temperature: z.number().min(0).max(2),
    max_tool_calls_per_request: z.number().int().positive(),
    max_json_repair_attempts: z.number().int().nonnegative(),
    max_tool_result_chars: z.number().int().positive(),
    max_log_lines_default: z.number().int().positive(),
  }),
  runtime_inventory: z.object({
    refresh_interval: durationSchema,
    store_snapshots: z.boolean(),
  }),
  detection: z.object({
    stacks_dir: z.string(),
    common_stack_dirs: z.array(z.string()),
  }),
  channels: z.object({
    terminal: z.object({
      enabled: z.boolean(),
    }),
  }),
  tui: z.object({
    theme: z.enum(['colourful']),
    show_tool_trace: z.boolean(),
    show_watchtower_panel: z.boolean(),
    colour_mode: z.enum(['auto', 'truecolor', '256', 'mono']),
  }),
  permissions: z.object({
    trusted_paths: z.array(z.string()),
  }),
  actions: z.object({
    require_approval: z.boolean(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
  }),
});

export type SentinelConfig = z.infer<typeof sentinelConfigSchema>;
