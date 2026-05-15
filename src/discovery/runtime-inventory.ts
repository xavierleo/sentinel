import type { RuntimeInventoryResult } from './docker-discovery.js';
import type { RuntimeServiceProfile } from './runtime-profile.js';

export interface RuntimeInventoryPayload {
  schemaVersion: 1;
  generatedAt: string;
  counts: {
    total: number;
    running: number;
    stopped: number;
  };
  services: RuntimeServiceProfile[];
  error?: {
    status: Exclude<RuntimeInventoryResult['status'], 'ok'>;
    message: string;
  };
}

function countProfiles(profiles: RuntimeServiceProfile[]) {
  const running = profiles.filter((profile) => profile.status === 'running').length;
  return {
    total: profiles.length,
    running,
    stopped: profiles.length - running,
  };
}

export function buildRuntimeInventoryPayload(result: RuntimeInventoryResult): RuntimeInventoryPayload {
  if (result.status !== 'ok') {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      counts: {
        total: 0,
        running: 0,
        stopped: 0,
      },
      services: [],
      error: {
        status: result.status,
        message: result.message,
      },
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: result.profiles[0]?.lastSeenAt ?? new Date().toISOString(),
    counts: countProfiles(result.profiles),
    services: result.profiles,
  };
}
