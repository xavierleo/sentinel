import { describe, expect, it } from 'vitest';
import { matchSkillTriggers } from '../src/skills/triggers.js';
import type { SkillSummary } from '../src/skills/registry.js';

function skill(name: string, triggers?: string[], paths?: string[]): SkillSummary {
  return {
    name,
    description: `${name} description`,
    metadata: {
      name,
      description: `${name} description`,
      triggers,
      paths,
      status: 'active',
    },
  };
}

describe('skill trigger matching', () => {
  it('matches plain string triggers case-insensitively', () => {
    const matches = matchSkillTriggers('Plex is DOWN again', [skill('triage', ['service down', 'plex is down'])]);

    expect(matches).toEqual(['triage']);
  });

  it('matches slash-delimited regular expression triggers', () => {
    const matches = matchSkillTriggers('why is sonarr slow?', [skill('triage', ['/why is .+ slow\\?/'])]);

    expect(matches).toEqual(['triage']);
  });

  it('ignores malformed regex triggers and skills without matching paths', () => {
    const matches = matchSkillTriggers(
      'service down',
      [skill('bad-regex', ['/[unterminated/']), skill('wrong-path', ['service down'], ['deploy/**'])],
      { cwd: 'src' },
    );

    expect(matches).toEqual([]);
  });

  it('deduplicates and sorts matched skill names', () => {
    const matches = matchSkillTriggers('service down and disk full', [
      skill('z-triage', ['service down', 'disk full']),
      skill('a-disk', ['disk full']),
    ]);

    expect(matches).toEqual(['a-disk', 'z-triage']);
  });
});
