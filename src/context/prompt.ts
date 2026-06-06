export interface SystemPromptSections {
  stableRules: string;
  toolCatalog: string;
  memorySummary: string;
  preferences: string;
  channelInstructions: string;
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
