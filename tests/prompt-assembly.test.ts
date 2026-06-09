import { describe, expect, it } from 'vitest';
import { assembleCacheableSystemPrompt, assembleSystemPrompt } from '../src/context/prompt.js';

describe('prompt assembly', () => {
  it('assembles workspace prompt blocks in v2.2 order', () => {
    const prompt = assembleSystemPrompt({
      staticPreamble: 'You are Sentinel.',
      soul: '# SOUL',
      memory: '# MEMORY',
      userProfile: '# USER',
      skillsIndex: '<available_skills>\n</available_skills>',
      projectContext: '# AGENTS',
      todayLog: '- today',
      yesterdayLog: '- yesterday',
      toolCatalog: 'Tools: fs_read, container_list',
      inventorySummary: 'Inventory memory:\n- container sonarr',
      channelContext: 'Channel: CLI',
    });

    expect(prompt).toBe(
      [
        'You are Sentinel.',
        '<soul>\n# SOUL\n</soul>',
        '<memory>\n# MEMORY\n</memory>\n\n<user_profile>\n# USER\n</user_profile>',
        '<available_skills>\n</available_skills>',
        '<project_context>\n# AGENTS\n</project_context>',
        '<today_log>\n- today\n</today_log>',
        '<yesterday_log>\n- yesterday\n</yesterday_log>',
        '<tool_catalog>\nTools: fs_read, container_list\n</tool_catalog>',
        'Inventory memory:\n- container sonarr',
        'Channel: CLI',
      ].join('\n\n'),
    );
  });

  it('omits empty optional sections without extra whitespace', () => {
    expect(
      assembleSystemPrompt({
        staticPreamble: 'You are Sentinel.',
        soul: '',
        memory: '',
        userProfile: '',
        skillsIndex: '',
        projectContext: '',
        todayLog: '',
        yesterdayLog: '',
        toolCatalog: '',
        inventorySummary: '',
        channelContext: 'Channel: CLI',
      }),
    ).toBe('You are Sentinel.\n\nChannel: CLI');
  });

  it('marks v2.2 cache breakpoints after memory/user and skills index', () => {
    expect(
      assembleCacheableSystemPrompt({
        staticPreamble: 'You are Sentinel.',
        soul: '# SOUL',
        memory: '# MEMORY',
        userProfile: '# USER',
        skillsIndex: '<available_skills>\n</available_skills>',
        projectContext: '# AGENTS',
        todayLog: '',
        yesterdayLog: '',
        toolCatalog: 'Tools: fs_read',
        inventorySummary: 'Inventory memory: empty',
        channelContext: 'Channel: CLI',
      }),
    ).toEqual([
      { text: 'You are Sentinel.', cacheControl: true },
      { text: '<soul>\n# SOUL\n</soul>', cacheControl: false },
      { text: '<memory>\n# MEMORY\n</memory>\n\n<user_profile>\n# USER\n</user_profile>', cacheControl: true },
      { text: '<available_skills>\n</available_skills>', cacheControl: true },
      { text: '<project_context>\n# AGENTS\n</project_context>', cacheControl: false },
      { text: '<tool_catalog>\nTools: fs_read\n</tool_catalog>', cacheControl: false },
      { text: 'Inventory memory: empty', cacheControl: false },
      { text: 'Channel: CLI', cacheControl: false },
    ]);
  });
});
