import type { PermissionEngine } from './types.js';

export function createPermissionEngineV0(): PermissionEngine {
  return {
    evaluate(request) {
      if (request.annotations.readOnly && !request.annotations.destructive) {
        return {
          decision: 'allow',
          reason: 'read-only tool allowed in Milestone 1',
        };
      }

      return {
        decision: 'deny',
        reason: 'mutating tools require confirmation UX after Milestone 1',
      };
    },
  };
}

export function createDefaultPermissionEngine(): PermissionEngine {
  return {
    evaluate(request) {
      if (request.annotations.readOnly && !request.annotations.destructive) {
        return {
          decision: 'allow',
          reason: 'read-only tool allowed by default',
        };
      }

      return {
        decision: 'ask',
        reason: 'no permission rule matched',
      };
    },
  };
}

export type { PermissionEngine, PermissionResult } from './types.js';
