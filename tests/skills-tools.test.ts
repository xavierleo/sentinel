import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSkillIndexTool, createSkillViewTool } from '../src/tools/skills.js';

describe('skills tools', () => {
  it('returns skill index and skill bodies', async () => {
    const root = join(tmpdir(), `sentinel-skill-tools-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try {
      await mkdir(join(root, 'skills', 'triage'), { recursive: true });
      await writeFile(join(root, 'skills', 'triage', 'SKILL.md'), '---\nname: triage\ndescription: Triage services\n---\n# Triage\n');

      await expect(createSkillIndexTool({ root }).execute({})).resolves.toEqual({
        index: '<available_skills>\n- triage: Triage services\n</available_skills>',
      });
      await expect(createSkillViewTool({ root }).execute({ name: 'triage' })).resolves.toEqual({
        name: 'triage',
        file: 'SKILL.md',
        content: '# Triage',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
