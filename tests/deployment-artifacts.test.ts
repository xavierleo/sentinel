import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deployment hardening artifacts', () => {
  it('defines a non-root read-only container deployment', async () => {
    const compose = await readFile('deploy/docker-compose.yml', 'utf8');

    expect(compose).toContain('read_only: true');
    expect(compose).toContain('user: "1500:1500"');
    expect(compose).toContain('no-new-privileges:true');
    expect(compose).toContain('/var/lib/sentinel');
    expect(compose).toContain('/var/log/sentinel');
  });

  it('defines a systemd unit with restart and hardening settings', async () => {
    const unit = await readFile('deploy/sentinel.service', 'utf8');

    expect(unit).toContain('Restart=unless-stopped');
    expect(unit).toContain('NoNewPrivileges=true');
    expect(unit).toContain('ReadWritePaths=/var/lib/sentinel /var/log/sentinel /tmp');
  });

  it('defines log rotation for structured runtime logs', async () => {
    const policy = await readFile('deploy/sentinel.logrotate', 'utf8');

    expect(policy).toContain('/var/log/sentinel/*.jsonl');
    expect(policy).toContain('daily');
    expect(policy).toContain('rotate 14');
    expect(policy).toContain('compress');
  });
});
