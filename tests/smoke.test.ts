import { describe, expect, it } from 'vitest';
import { getVersionLabel } from '../src/index.js';

describe('project scaffold', () => {
  it('exposes a Sentinel version label', () => {
    expect(getVersionLabel()).toBe('Sentinel v1.0 Runtime Awareness');
  });
});
