export interface SystemPromptSections {
  staticPreamble: string;
  soul: string;
  memory: string;
  userProfile: string;
  skillsIndex: string;
  projectContext: string;
  todayLog: string;
  yesterdayLog: string;
  toolCatalog: string;
  inventorySummary: string;
  channelContext: string;
}

export interface CacheablePromptSegment {
  text: string;
  cacheControl: boolean;
}

function wrap(tag: string, content: string): string {
  return content.trim() ? `<${tag}>\n${content.trim()}\n</${tag}>` : '';
}

function promptSegments(sections: SystemPromptSections): CacheablePromptSegment[] {
  return [
    { text: sections.staticPreamble, cacheControl: true },
    { text: wrap('soul', sections.soul), cacheControl: false },
    {
      text: [wrap('memory', sections.memory), wrap('user_profile', sections.userProfile)].filter(Boolean).join('\n\n'),
      cacheControl: true,
    },
    { text: sections.skillsIndex, cacheControl: true },
    { text: wrap('project_context', sections.projectContext), cacheControl: false },
    { text: wrap('today_log', sections.todayLog), cacheControl: false },
    { text: wrap('yesterday_log', sections.yesterdayLog), cacheControl: false },
    { text: wrap('tool_catalog', sections.toolCatalog), cacheControl: false },
    { text: sections.inventorySummary, cacheControl: false },
    { text: sections.channelContext, cacheControl: false },
  ]
    .map((segment) => ({ ...segment, text: segment.text.trim() }))
    .filter((segment) => segment.text.length > 0);
}

export function assembleSystemPrompt(sections: SystemPromptSections): string {
  return promptSegments(sections)
    .map((section) => section.text)
    .join('\n\n');
}

export function assembleCacheableSystemPrompt(sections: SystemPromptSections): CacheablePromptSegment[] {
  return promptSegments(sections);
}
