import { describe, expect, it } from 'vitest';
import { runDoctor } from '../src/ops/doctor.js';

describe('doctor checks', () => {
  it('reports ok when database, audit, backup, model, and scheduler checks pass', async () => {
    const result = await runDoctor({
      checks: {
        database: async () => ({ ok: true, message: 'sqlite ok' }),
        auditLog: async () => ({ ok: true, message: 'audit writable' }),
        backup: async () => ({ ok: true, message: 'backup integrity ok' }),
        model: async () => ({ ok: true, message: 'model reachable' }),
        scheduler: async () => ({ ok: true, message: 'scheduler idle' }),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(['database', 'auditLog', 'backup', 'model', 'scheduler']);
  });

  it('fails when any startup check fails', async () => {
    const result = await runDoctor({
      checks: {
        database: async () => ({ ok: true, message: 'sqlite ok' }),
        auditLog: async () => ({ ok: false, message: 'audit not writable' }),
      },
    });

    expect(result).toEqual({
      ok: false,
      checks: [
        { name: 'database', ok: true, message: 'sqlite ok' },
        { name: 'auditLog', ok: false, message: 'audit not writable' },
      ],
    });
  });
});
