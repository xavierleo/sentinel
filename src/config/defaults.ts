import { homedir } from 'node:os';
import type { SentinelConfig } from './schema.js';

export const defaultConfig: SentinelConfig = {
  agent: {
    model: 'qwen2.5:7b',
    model_profile: 'balanced',
    ollama_url: 'http://localhost:11434',
    temperature: 0.1,
    max_tool_calls_per_request: 5,
    max_json_repair_attempts: 2,
    max_tool_result_chars: 12000,
    max_log_lines_default: 80,
  },
  runtime_inventory: {
    refresh_interval: '5m',
    store_snapshots: true,
  },
  storage: {
    driver: 'sqlite',
    sqlite_path: `${homedir()}/.sentinel/state.db`,
  },
  detection: {
    stacks_dir: '',
    common_stack_dirs: ['/opt/stacks', '/opt/docker', '/srv'],
  },
  channels: {
    terminal: {
      enabled: true,
    },
  },
  tui: {
    theme: 'colourful',
    show_tool_trace: true,
    show_watchtower_panel: true,
    colour_mode: 'auto',
  },
  permissions: {
    trusted_paths: [],
  },
  actions: {
    require_approval: true,
  },
  daemon: {
    foreground: true,
  },
  logging: {
    level: 'info',
  },
};
