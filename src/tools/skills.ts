import { z } from 'zod';
import { createSkillsRegistry } from '../skills/registry.js';
import type { ToolDefinition } from './types.js';

const skillIndexSchema = z.object({});
const skillViewSchema = z.object({
  name: z.string().min(1),
  file_path: z.string().min(1).optional(),
});

export function createSkillIndexTool(options: { root: string }): ToolDefinition<
  z.input<typeof skillIndexSchema>,
  { index: string }
> {
  return {
    name: 'skill_index',
    description: 'Return the active Sentinel skills index.',
    schema: skillIndexSchema,
    annotations: { readOnly: true },
    async execute() {
      const registry = await createSkillsRegistry({ root: options.root });
      return { index: registry.index() };
    },
  };
}

export function createSkillViewTool(options: { root: string }): ToolDefinition<
  z.input<typeof skillViewSchema>,
  { name: string; file: string; content: string }
> {
  return {
    name: 'skill_view',
    description: 'Load an active skill body or one allowed supporting file.',
    schema: skillViewSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = skillViewSchema.parse(args);
      const registry = await createSkillsRegistry({ root: options.root });
      return registry.view(parsed.name, parsed.file_path);
    },
  };
}

