import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('install script', () => {
  it('is valid bash', () => {
    const result = spawnSync('bash', ['-n', 'scripts/install.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('installs from the local project rather than a placeholder URL', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain('npm install');
    expect(source).toContain('npm run build');
    expect(source).toContain('npm link');
    expect(source).not.toContain('YOUR_USER');
  });
});
