import { describe, expect, it } from 'vitest';
import { loadConfigFromString } from '../../src/config/loader.js';

describe('config loader', () => {
  it('merges user config with defaults', () => {
    const config = loadConfigFromString(`
agent:
  model: llama3.1:8b
runtime_inventory:
  refresh_interval: 10m
`);

    expect(config.agent.model).toBe('llama3.1:8b');
    expect(config.agent.ollama_url).toBe('http://localhost:11434');
    expect(config.runtime_inventory.refresh_interval).toBe('10m');
    expect(config.tui.colour_mode).toBe('auto');
  });

  it('loads storage and daemon overrides from yaml', () => {
    const config = loadConfigFromString(`
storage:
  driver: sqlite
  sqlite_path: /tmp/sentinel-state.db
daemon:
  foreground: false
`);

    expect(config.storage.driver).toBe('sqlite');
    expect(config.storage.sqlite_path).toBe('/tmp/sentinel-state.db');
    expect(config.daemon.foreground).toBe(false);
  });

  it('rejects invalid refresh intervals', () => {
    expect(() =>
      loadConfigFromString(`
runtime_inventory:
  refresh_interval: tomorrow
`),
    ).toThrow(/refresh_interval/);
  });
});
