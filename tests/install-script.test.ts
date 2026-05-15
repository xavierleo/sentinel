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

  it('supports the public quick install command', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain('https://github.com/xavierleo/sentinel.git');
    expect(source).toContain('SENTINEL_INSTALL_DIR');
    expect(source).toContain('SENTINEL_BRANCH');
    expect(source).toContain('raw.githubusercontent.com/xavierleo/sentinel/main/scripts/install.sh');
  });

  it('can bootstrap Sentinel when streamed outside a checkout', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain('git clone');
    expect(source).toContain('pull --ff-only');
    expect(source).toContain('$HOME/.sentinel/sentinel');
    expect(source).toContain('PROJECT_ROOT=');
  });

  it('keeps installer logs out of command-substituted paths', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain("printf '[sentinel] %s\\n' \"$1\" >&2");
  });
});
