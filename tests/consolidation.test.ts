import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConsolidationReflection, createConsolidationProposals } from '../src/consolidation/reflection.js';
import { createStateDatabase } from '../src/storage/database.js';

async function tempWorkspace() {
  const root = join(tmpdir(), `sentinel-consolidation-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const proposalsRoot = join(root, 'proposals');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'MEMORY.md'), '# MEMORY\n');
  await writeFile(join(root, 'USER.md'), '# USER\n');
  return { root, proposalsRoot };
}

describe('consolidation reflection', () => {
  it('parses valid reflection JSON and requires quoted transcript evidence', () => {
    const transcript = 'user: Reverse proxy is the only public entry.\nassistant: noted';
    const reflection = parseConsolidationReflection(
      JSON.stringify({
        memory: [{ category: 'Topology', fact: 'Reverse proxy is the only public entry.', quote: 'Reverse proxy is the only public entry.' }],
        user: [{ fact: 'Prefers short answers.', quote: 'Reverse proxy is the only public entry.' }],
        skills: [{ name: 'triage-service', description: 'Triage service failures', triggers: ['service down'], body: '# Triage\nDo it.' }],
      }),
      transcript,
    );

    expect(reflection.memory).toHaveLength(1);
    expect(reflection.user).toHaveLength(1);
    expect(reflection.skills).toHaveLength(1);
  });

  it('rejects malformed JSON and missing transcript quotes', () => {
    expect(() => parseConsolidationReflection('not json', 'user: hello')).toThrow('Consolidation output must be valid JSON');
    expect(() =>
      parseConsolidationReflection(
        JSON.stringify({ memory: [{ category: 'Topology', fact: 'No citation.', quote: 'missing quote' }], user: [], skills: [] }),
        'user: hello',
      ),
    ).toThrow('quote was not found in transcript');
  });

  it('creates workspace proposals for memory, user, and skill reflections', async () => {
    const { root, proposalsRoot } = await tempWorkspace();
    const db = createStateDatabase(':memory:');
    let nextId = 0;
    try {
      const result = await createConsolidationProposals({
        root,
        proposalsRoot,
        db,
        sessionId: 'cli:local:chat',
        now: () => 1,
        id: () => `1-cons${++nextId}`,
        reflection: {
          memory: [{ category: 'Topology', fact: 'Reverse proxy is public.', quote: 'Reverse proxy is public.' }],
          user: [{ fact: 'Prefers short answers.', quote: 'Prefers short answers.' }],
          skills: [{ name: 'triage-service', description: 'Triage services', triggers: ['service down'], body: '# Triage\nSteps.' }],
        },
      });

      expect(result.proposals).toEqual([
        { id: '1-cons1', target: 'MEMORY.md' },
        { id: '1-cons2', target: 'USER.md' },
        { id: '1-cons3', target: 'skills/triage-service/SKILL.md' },
      ]);
      await expect(readFile(join(proposalsRoot, '1-cons1.new'), 'utf8')).resolves.toContain('- Reverse proxy is public.');
      await expect(readFile(join(proposalsRoot, '1-cons2.new'), 'utf8')).resolves.toContain('- Prefers short answers.');
      await expect(readFile(join(proposalsRoot, '1-cons3.new'), 'utf8')).resolves.toContain('name: triage-service');
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
      await rm(proposalsRoot, { recursive: true, force: true });
    }
  });
});
