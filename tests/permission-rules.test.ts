import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createYamlPermissionEngine } from '../src/permissions/rules.js';

describe('YAML permission engine', () => {
  it('checks deny rules before allow rules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sentinel-perms-'));
    const rulesPath = join(root, 'permissions.yaml');
    await writeFile(
      rulesPath,
      [
        'deny:',
        '  - container_action(name=*, action=remove)',
        'allow:',
        '  - container_action',
        '  - fs_read',
      ].join('\n'),
    );

    try {
      const engine = await createYamlPermissionEngine({ rulesPath });

      expect(
        engine.evaluate({
          toolName: 'container_action',
          input: { name: 'sonarr', action: 'remove' },
          annotations: { destructive: true },
        }),
      ).toEqual({
        decision: 'deny',
        reason: 'matched deny rule: container_action(name=*, action=remove)',
      });
      expect(engine.evaluate({ toolName: 'fs_read', input: { path: '/tmp/a' }, annotations: { readOnly: true } })).toEqual({
        decision: 'allow',
        reason: 'matched allow rule: fs_read',
      });
      expect(engine.evaluate({ toolName: 'fs_list', input: { path: '/tmp' }, annotations: { readOnly: true } })).toEqual({
        decision: 'ask',
        reason: 'no permission rule matched',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
