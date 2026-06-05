import type { ToolAnnotations } from '../tools/types.js';

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionRequest {
  toolName: string;
  input?: unknown;
  annotations: ToolAnnotations;
}

export interface PermissionResult {
  decision: PermissionDecision;
  reason: string;
}

export interface PermissionEngine {
  evaluate: (request: PermissionRequest) => PermissionResult;
}
