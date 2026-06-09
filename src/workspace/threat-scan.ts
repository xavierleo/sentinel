export interface ThreatMatch {
  category: string;
  pattern: string;
}

const threatPatterns: { category: string; regex: RegExp }[] = [
  { category: 'prompt_injection', regex: /ignore (previous|all|above|prior) instructions/i },
  { category: 'deception_hide', regex: /do not tell the user/i },
  { category: 'sys_prompt_override', regex: /system prompt override/i },
  { category: 'disregard_rules', regex: /disregard (your|all|any) (instructions|rules|guidelines)/i },
  {
    category: 'bypass_restrictions',
    regex: /act as (if|though) you (have no|don't have) (restrictions|limits|rules)/i,
  },
  { category: 'html_comment_injection', regex: /<!--[\s\S]*(ignore|override|system|secret|hidden)[\s\S]*-->/i },
  { category: 'hidden_div', regex: /<div style=["']?display:\s*none/i },
  { category: 'translate_execute', regex: /translate [\s\S]* into [\s\S]* and (execute|run|eval)/i },
  { category: 'exfil_curl', regex: /curl [\s\S]*\$\{?(API_)?(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\}?/i },
  { category: 'read_secrets', regex: /cat .* (\.env|credentials|\.netrc|\.pgpass)/i },
  { category: 'invisible_unicode', regex: /[\u200b\u200c\u200d\u2060\ufeff\u202a-\u202e]/ },
];

export function scanThreats(content: string): ThreatMatch[] {
  return threatPatterns
    .filter((entry) => entry.regex.test(content))
    .map((entry) => ({ category: entry.category, pattern: entry.regex.source }));
}

export function blockedContent(file: string, matches: ThreatMatch[]): string {
  return `[BLOCKED ${file}: ${matches.map((match) => match.category).join(', ')}]`;
}

