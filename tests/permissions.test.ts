import { describe, expect, it } from 'vitest';
import { createDefaultPermissionEngine, createPermissionEngineV0 } from '../src/permissions/engine.js';

describe('permission engine v0', () => {
  it('allows read-only tools and denies mutating tools', () => {
    const engine = createPermissionEngineV0();

    expect(engine.evaluate({ toolName: 'fs_read', annotations: { readOnly: true } })).toEqual({
      decision: 'allow',
      reason: 'read-only tool allowed in Milestone 1',
    });
    expect(engine.evaluate({ toolName: 'fs_write', annotations: { destructive: true } })).toEqual({
      decision: 'deny',
      reason: 'mutating tools require confirmation UX after Milestone 1',
    });
  });
});

describe('default permission engine', () => {
  it('allows read-only tools and asks for mutating tools', () => {
    const engine = createDefaultPermissionEngine();

    expect(engine.evaluate({ toolName: 'fs_read', annotations: { readOnly: true } })).toEqual({
      decision: 'allow',
      reason: 'read-only tool allowed by default',
    });
    expect(engine.evaluate({ toolName: 'container_action', annotations: { destructive: true } })).toEqual({
      decision: 'ask',
      reason: 'no permission rule matched',
    });
  });
});
