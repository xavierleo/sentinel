import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSkillsRegistry } from '../src/skills/registry.js';

async function createRoot() {
  const root = join(tmpdir(), `sentinel-skills-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(root, 'skills'), { recursive: true });
  return root;
}

describe('skills registry', () => {
  it('indexes active skills alphabetically and excludes inactive skills', async () => {
    const root = await createRoot();
    try {
      await mkdir(join(root, 'skills', 'z-last'), { recursive: true });
      await writeFile(
        join(root, 'skills', 'z-last', 'SKILL.md'),
        '---\nname: z-last\ndescription: Last skill\nstatus: active\n---\n# Last\n',
      );
      await mkdir(join(root, 'skills', 'a-first'), { recursive: true });
      await writeFile(
        join(root, 'skills', 'a-first', 'SKILL.md'),
        '---\nname: a-first\ndescription: First skill\nstatus: active\n---\n# First\n',
      );
      await mkdir(join(root, 'skills', 'draft'), { recursive: true });
      await writeFile(
        join(root, 'skills', 'draft', 'SKILL.md'),
        '---\nname: draft\ndescription: Draft skill\nstatus: proposed\n---\n# Draft\n',
      );

      const registry = await createSkillsRegistry({ root });

      expect(registry.index()).toBe('<available_skills>\n- a-first: First skill\n- z-last: Last skill\n</available_skills>');
      expect(registry.list().map((skill) => skill.name)).toEqual(['a-first', 'z-last']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads skill bodies and allowed supporting files', async () => {
    const root = await createRoot();
    try {
      await mkdir(join(root, 'skills', 'triage', 'templates'), { recursive: true });
      await writeFile(
        join(root, 'skills', 'triage', 'SKILL.md'),
        '---\nname: triage\ndescription: Triage services\n---\n# Triage\nBody',
      );
      await writeFile(join(root, 'skills', 'triage', 'templates', 'report.md'), 'Report template');

      const registry = await createSkillsRegistry({ root });

      await expect(registry.view('triage')).resolves.toEqual({
        name: 'triage',
        file: 'SKILL.md',
        content: '# Triage\nBody',
      });
      await expect(registry.view('triage', 'templates/report.md')).resolves.toEqual({
        name: 'triage',
        file: 'templates/report.md',
        content: 'Report template',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects path traversal and unsupported support directories', async () => {
    const root = await createRoot();
    try {
      await mkdir(join(root, 'skills', 'triage'), { recursive: true });
      await writeFile(
        join(root, 'skills', 'triage', 'SKILL.md'),
        '---\nname: triage\ndescription: Triage services\n---\n# Triage\nBody',
      );
      const registry = await createSkillsRegistry({ root });

      await expect(registry.view('triage', '../secret')).rejects.toThrow('Skill file escapes skill directory');
      await expect(registry.view('triage', 'private/file.md')).rejects.toThrow('Unsupported skill support directory');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
