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

    expect(source).toContain('npm ci --omit=dev');
    expect(source).not.toContain('npm run build');
    expect(source).not.toContain('npm link');
    expect(source).not.toContain('YOUR_USER');
  });

  it('supports the public latest-release quick install command', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain('https://api.github.com/repos/${REPO}/releases/latest');
    expect(source).toContain('SENTINEL_INSTALL_DIR');
    expect(source).toContain('SENTINEL_VERSION');
    expect(source).toContain('raw.githubusercontent.com/xavierleo/sentinel/main/scripts/install.sh');
  });

  it('downloads and verifies the release tarball before installing', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain('sentinel-${VERSION}.tar.gz');
    expect(source).toContain('SHA256_URL');
    expect(source).toContain('Checksum mismatch');
    expect(source).toContain('sha256sum');
    expect(source).toContain('shasum -a 256');
    expect(source).toContain('Unsafe tarball entry');
  });

  it('installs a wrapper command and smoke tests it', () => {
    const source = readFileSync('scripts/install.sh', 'utf8');

    expect(source).toContain('BIN_PATH="/usr/local/bin/sentinel"');
    expect(source).toContain('exec "\\${NODE_BIN}" "${INSTALL_DIR}/dist/index.js" "\\$@"');
    expect(source).toContain('sudo tee "$BIN_PATH"');
    expect(source).toContain('"$BIN_PATH" --version');
  });

  it('publishes release tarballs and checksums', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');

    expect(workflow).toContain('sentinel-${VERSION}.tar.gz');
    expect(workflow).toContain('sha256sum "release-artifacts/$TARBALL"');
    expect(workflow).toContain('Smoke test release tarball');
    expect(workflow).toContain('node smoke/dist/index.js --version');
  });
});
