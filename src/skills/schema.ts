import { z } from 'zod';

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  description: z.string().min(1).max(1024),
  triggers: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  allowed_tools: z.array(z.string()).optional(),
  required_env: z.array(z.string()).optional(),
  platforms: z.array(z.enum(['linux', 'macos', 'windows'])).optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  created_by: z.enum(['user', 'agent', 'hub']).optional(),
  status: z.enum(['active', 'proposed', 'degraded', 'archived']).default('active'),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

