import { describe, expect, it } from 'vitest';
import { createHealthServer } from '../src/daemon/health.js';

describe('health server', () => {
  it('serves /healthz on loopback', async () => {
    const server = createHealthServer({ host: '127.0.0.1', port: 0, isReady: () => true });
    const started = await server.start();

    try {
      const response = await fetch(`${started.url}/healthz`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('ok');
    } finally {
      await started.stop();
    }
  });

  it('returns 503 when not ready', async () => {
    const server = createHealthServer({ host: '127.0.0.1', port: 0, isReady: () => false });
    const started = await server.start();

    try {
      const response = await fetch(`${started.url}/healthz`);

      expect(response.status).toBe(503);
    } finally {
      await started.stop();
    }
  });
});
