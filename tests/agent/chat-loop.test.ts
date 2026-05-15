import { describe, expect, it, vi } from 'vitest';
import { runChatLoop } from '../../src/agent/chat-loop.js';
import { createToolRegistry } from '../../src/tools/index.js';
import { defaultConfig } from '../../src/config/defaults.js';

describe('chat loop', () => {
  it('collects a trace for deterministic routed inventory answers', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('model should not be called');
    });
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({
        schemaVersion: 1,
        counts: { total: 2, running: 1, stopped: 1 },
        services: [
          {
            id: 'sonarr',
            displayName: 'Sonarr',
            source: 'runtime_discovery',
            containerName: 'sonarr',
            image: 'lscr.io/linuxserver/sonarr:latest',
            status: 'running',
            health: 'unknown',
            ports: [],
            mounts: [],
            networks: [],
            restartPolicy: 'unless-stopped',
            createdBySentinel: false,
            lastSeenAt: '2026-05-15T15:00:00.000Z',
          },
        ],
      }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const trace: unknown[] = [];
    const result = await runChatLoop({
      message: "what's running?",
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
      onTrace: (entry) => trace.push(entry),
    });

    expect(result).toContain('Sentinel runtime inventory');
    expect(callModel).not.toHaveBeenCalled();
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'route_selected', route: 'inventory_summary' }),
        expect.objectContaining({ type: 'outcome', outcome: 'routed_response' }),
      ]),
    );
  });

  it('returns a direct model response without calling tools', async () => {
    const callModel = vi.fn(async () => '{"thought":"answer directly","action":"respond","response":"Sonarr is running."}');
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 1, running: 1, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const result = await runChatLoop({
      message: 'tell me about sonarr',
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toBe('Sonarr is running.');
    expect(callModel).toHaveBeenCalledOnce();
  });

  it('allows the model to call a tool and then respond', async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce('{"thought":"inspect containers","action":"tool_call","tool":"list_containers","args":{}}')
      .mockResolvedValueOnce(
        '{"thought":"summarize","action":"respond","response":"I found Sonarr running on port 8989."}',
      );

    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({
        schemaVersion: 1,
        counts: { total: 1, running: 1, stopped: 0 },
        services: [
          {
            id: 'sonarr',
            displayName: 'Sonarr',
            source: 'runtime_discovery',
            containerName: 'sonarr',
            image: 'lscr.io/linuxserver/sonarr:latest',
            status: 'running',
            health: 'unknown',
            ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
            mounts: [],
            networks: ['cerebro-net'],
            restartPolicy: 'unless-stopped',
            createdBySentinel: false,
            lastSeenAt: '2026-05-15T15:00:00.000Z',
          },
        ],
      }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const result = await runChatLoop({
      message: 'inspect containers with tools',
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toBe('I found Sonarr running on port 8989.');
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[1]?.[0]).toContain('"tool":"list_containers"');
    expect(callModel.mock.calls[1]?.[0]).toContain('"containerName":"sonarr"');
  });

  it('repairs malformed JSON before succeeding', async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"thought":"retry cleanly","action":"respond","response":"Docker looks healthy."}');

    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const result = await runChatLoop({
      message: 'is docker okay?',
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toBe('Docker looks healthy.');
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it('accepts fenced JSON model responses without needing repair', async () => {
    const callModel = vi.fn(async () =>
      '```json\n{"thought":"inspect containers","action":"tool_call","tool":"list_containers","args":{}}\n```',
    );
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const result = await runChatLoop({
      message: 'inspect containers with fenced json',
      config: {
        ...defaultConfig,
        agent: {
          ...defaultConfig.agent,
          max_tool_calls_per_request: 1,
        },
      },
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toContain('tool-call limit');
    expect(callModel).toHaveBeenCalledOnce();
  });

  it('fails safely when the model exceeds the tool-call limit', async () => {
    const callModel = vi.fn(async () => '{"thought":"keep inspecting","action":"tool_call","tool":"list_containers","args":{}}');
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const result = await runChatLoop({
      message: 'loop forever',
      config: {
        ...defaultConfig,
        agent: {
          ...defaultConfig.agent,
          max_tool_calls_per_request: 2,
        },
      },
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toContain('could not finish safely');
    expect(callModel).toHaveBeenCalledTimes(2);
  });
});
