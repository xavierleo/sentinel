import { describe, expect, it } from 'vitest';
import { parseDecision } from '../../src/agent/decision-parser.js';

describe('decision parser', () => {
  it('accepts respond decisions', () => {
    const decision = parseDecision('{"thought":"done","action":"respond","response":"ok"}');
    expect(decision).toEqual({ thought: 'done', action: 'respond', response: 'ok' });
  });

  it('accepts tool call decisions with args', () => {
    const decision = parseDecision('{"thought":"inspect","action":"tool_call","tool":"list_containers","args":{}}');
    expect(decision.action).toBe('tool_call');
    if (decision.action !== 'tool_call') {
      throw new Error('Expected tool call decision');
    }
    expect(decision.tool).toBe('list_containers');
  });

  it('accepts JSON wrapped in a fenced code block', () => {
    const decision = parseDecision(
      '```json\n{"thought":"inspect","action":"tool_call","tool":"list_containers","args":{}}\n```',
    );

    expect(decision.action).toBe('tool_call');
  });

  it('accepts JSON wrapped in surrounding prose', () => {
    const decision = parseDecision(
      'Here is the decision:\n{"thought":"done","action":"respond","response":"Sonarr is running."}\nThanks.',
    );

    expect(decision).toEqual({
      thought: 'done',
      action: 'respond',
      response: 'Sonarr is running.',
    });
  });

  it('rejects schedule decisions in v1.x', () => {
    expect(() => parseDecision('{"thought":"later","action":"schedule"}')).toThrow(/Scheduling is not available/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseDecision('{nope')).toThrow(/Invalid JSON/);
  });

  it('rejects respond decisions with tool call fields', () => {
    expect(() =>
      parseDecision('{"thought":"done","action":"respond","response":"ok","tool":"list_containers","args":{}}'),
    ).toThrow(/Invalid decision shape.*(Unrecognized key|tool)/);
  });

  it('rejects non-object JSON with a useful shape error', () => {
    expect(() => parseDecision('[]')).toThrow(/Invalid decision shape.*<root>.*Expected object/);
  });
});
