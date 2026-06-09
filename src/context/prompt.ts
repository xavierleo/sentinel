export interface SystemPromptSections {
  stableRules: string;
  toolCatalog: string;
  memorySummary: string;
  preferences: string;
  channelInstructions: string;
}

export interface CacheablePromptSegment {
  text: string;
  cacheControl: boolean;
}

export function assembleSystemPrompt(sections: SystemPromptSections): string {
  return [
    sections.stableRules,
    sections.toolCatalog,
    sections.memorySummary,
    sections.preferences,
    sections.channelInstructions,
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function assembleCacheableSystemPrompt(sections: SystemPromptSections): CacheablePromptSegment[] {
  return [
    { text: sections.stableRules, cacheControl: true },
    { text: sections.toolCatalog, cacheControl: true },
    { text: sections.memorySummary, cacheControl: false },
    { text: sections.preferences, cacheControl: false },
    { text: sections.channelInstructions, cacheControl: false },
  ]
    .map((segment) => ({ ...segment, text: segment.text.trim() }))
    .filter((segment) => segment.text.length > 0);
}
