import { describe, expect, it } from 'vitest';
import { assembleCacheableSystemPrompt, assembleSystemPrompt } from '../src/context/prompt.js';

describe('prompt assembly', () => {
  it('assembles stable rules, tools, memory, preferences, and channel instructions in order', () => {
    const prompt = assembleSystemPrompt({
      stableRules: 'You are Sentinel.',
      toolCatalog: 'Tools: fs_read, container_list',
      memorySummary: 'Inventory memory:\n- container sonarr',
      preferences: 'User preferences:\n- restart_window: midnight',
      channelInstructions: 'Channel: CLI',
    });

    expect(prompt).toBe(
      [
        'You are Sentinel.',
        'Tools: fs_read, container_list',
        'Inventory memory:\n- container sonarr',
        'User preferences:\n- restart_window: midnight',
        'Channel: CLI',
      ].join('\n\n'),
    );
  });

  it('omits empty optional sections without extra whitespace', () => {
    expect(
      assembleSystemPrompt({
        stableRules: 'You are Sentinel.',
        toolCatalog: '',
        memorySummary: '',
        preferences: 'User preferences: empty',
        channelInstructions: '',
      }),
    ).toBe('You are Sentinel.\n\nUser preferences: empty');
  });

  it('marks stable prompt segments as cacheable at Anthropic boundaries', () => {
    expect(
      assembleCacheableSystemPrompt({
        stableRules: 'You are Sentinel.',
        toolCatalog: 'Tools: fs_read',
        memorySummary: 'Inventory memory: empty',
        preferences: 'User preferences: empty',
        channelInstructions: 'Channel: CLI',
      }),
    ).toEqual([
      { text: 'You are Sentinel.', cacheControl: true },
      { text: 'Tools: fs_read', cacheControl: true },
      { text: 'Inventory memory: empty', cacheControl: false },
      { text: 'User preferences: empty', cacheControl: false },
      { text: 'Channel: CLI', cacheControl: false },
    ]);
  });
});
