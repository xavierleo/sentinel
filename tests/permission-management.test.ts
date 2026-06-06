import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addPermissionRule, listPermissionRules, removePermissionRule } from '../src/permissions/rules.js';

describe('permission rule management', () => {
  it('creates a YAML rule file and appends allow and deny rules without duplicates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-perms-'));
    const rulesPath = join(root, 'permissions.yaml');

    try {
      await addPermissionRule({ rulesPath, decision: 'allow', rule: 'container_list' });
      await addPermissionRule({ rulesPath, decision: 'deny', rule: 'container_action(name=*, action=remove)' });
      await addPermissionRule({ rulesPath, decision: 'allow', rule: 'container_list' });

      expect(await listPermissionRules({ rulesPath })).toEqual({
        allow: ['container_list'],
        deny: ['container_action(name=*, action=remove)'],
      });
      expect(await readFile(rulesPath, 'utf8')).toContain('allow:');
      expect(await readFile(rulesPath, 'utf8')).toContain('deny:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes a matching rule from the requested decision list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-perms-'));
    const rulesPath = join(root, 'permissions.yaml');
    await writeFile(rulesPath, ['allow:', '  - fs_read', '  - container_list', 'deny:', '  - fs_write(path=/etc/**)'].join('\n'));

    try {
      await removePermissionRule({ rulesPath, decision: 'allow', rule: 'fs_read' });

      expect(await listPermissionRules({ rulesPath })).toEqual({
        allow: ['container_list'],
        deny: ['fs_write(path=/etc/**)'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
