import matter from 'gray-matter';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { skillBodyBudget, skillSupportFileBudget } from '../workspace/paths.js';
import { blockedContent, scanThreats } from '../workspace/threat-scan.js';
import { skillFrontmatterSchema, type SkillFrontmatter } from './schema.js';

const supportedSkillDirs = new Set(['references', 'templates', 'scripts', 'assets']);

export interface SkillSummary {
  name: string;
  description: string;
  metadata: SkillFrontmatter;
}

export interface SkillsRegistry {
  list: () => SkillSummary[];
  index: () => string;
  view: (name: string, filePath?: string) => Promise<{ name: string; file: string; content: string }>;
}

interface LoadedSkill extends SkillSummary {
  root: string;
  body: string;
}

function assertInsideSkill(skillRoot: string, filePath: string): string {
  const absoluteSkillRoot = resolve(skillRoot);
  const absolute = resolve(skillRoot, filePath);
  if (absolute !== absoluteSkillRoot && !absolute.startsWith(`${absoluteSkillRoot}${sep}`)) {
    throw new Error('Skill file escapes skill directory');
  }
  return absolute;
}

async function loadSkill(root: string, dirName: string): Promise<LoadedSkill | undefined> {
  try {
    const skillRoot = join(root, 'skills', dirName);
    const parsed = matter(await readFile(join(skillRoot, 'SKILL.md'), 'utf8'));
    const metadata = skillFrontmatterSchema.parse(parsed.data);
    if (metadata.name !== dirName || metadata.status !== 'active') {
      return undefined;
    }
    if (parsed.content.length > skillBodyBudget) {
      return undefined;
    }
    return {
      name: metadata.name,
      description: metadata.description,
      metadata,
      root: skillRoot,
      body: parsed.content.trim(),
    };
  } catch {
    return undefined;
  }
}

export async function createSkillsRegistry(options: { root: string }): Promise<SkillsRegistry> {
  let dirs: string[] = [];
  try {
    dirs = await readdir(join(options.root, 'skills'));
  } catch {
    dirs = [];
  }
  const loaded = (await Promise.all(dirs.map((dir) => loadSkill(options.root, dir))))
    .filter((skill): skill is LoadedSkill => Boolean(skill))
    .sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map(loaded.map((skill) => [skill.name, skill]));

  return {
    list() {
      return loaded.map(({ root: _root, body: _body, ...summary }) => summary);
    },

    index() {
      if (loaded.length === 0) {
        return '<available_skills>\n</available_skills>';
      }
      return ['<available_skills>', ...loaded.map((skill) => `- ${skill.name}: ${skill.description}`), '</available_skills>'].join(
        '\n',
      );
    },

    async view(name, filePath) {
      const skill = byName.get(name);
      if (!skill) {
        throw new Error(`Unknown active skill: ${name}`);
      }
      if (!filePath) {
        const threats = scanThreats(skill.body);
        return {
          name,
          file: 'SKILL.md',
          content: threats.length > 0 ? blockedContent(`${name}/SKILL.md`, threats) : skill.body,
        };
      }

      const absolute = assertInsideSkill(skill.root, filePath);
      const firstSegment = filePath.split('/')[0];
      if (!supportedSkillDirs.has(firstSegment) || basename(filePath) === '..') {
        throw new Error('Unsupported skill support directory');
      }
      const size = (await stat(absolute)).size;
      if (size > skillSupportFileBudget) {
        throw new Error(`Skill support file exceeds 1048576 bytes: ${filePath}`);
      }
      const content = await readFile(absolute, 'utf8');
      const threats = scanThreats(content);
      return {
        name,
        file: filePath,
        content: threats.length > 0 ? blockedContent(`${name}/${filePath}`, threats) : content,
      };
    },
  };
}
