import { describe, expect, it, vi } from 'vitest';
import { runChatLoop } from '../../src/agent/chat-loop.js';
import { createToolRegistry } from '../../src/tools/index.js';
import { defaultConfig } from '../../src/config/defaults.js';

describe('chat loop', () => {
  it('answers inventory summary questions without calling the model', async () => {
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
    expect(result).toContain('Sonarr | running');
    expect(callModel).not.toHaveBeenCalled();
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'route_selected', route: 'inventory_summary' }),
        expect.objectContaining({ type: 'outcome', outcome: 'routed_response' }),
      ]),
    );
  });

  it('answers recent log questions without calling the model', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('model should not be called');
    });
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'line one\nline two',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    const trace: unknown[] = [];
    const result = await runChatLoop({
      message: 'show me recent logs for sonarr',
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
      onTrace: (entry) => trace.push(entry),
    });

    expect(result).toContain('Recent logs for sonarr');
    expect(result).toContain('line one');
    expect(callModel).not.toHaveBeenCalled();
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'route_selected', route: 'container_logs' }),
        expect.objectContaining({ type: 'outcome', outcome: 'routed_response' }),
      ]),
    );
  });

  it('answers unhealthy inventory questions without calling the model', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('model should not be called');
    });
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({
        schemaVersion: 1,
        counts: { total: 3, running: 1, stopped: 2 },
        services: [
          {
            id: 'sonarr',
            displayName: 'Sonarr',
            source: 'runtime_discovery',
            containerName: 'sonarr',
            image: 'lscr.io/linuxserver/sonarr:latest',
            status: 'running',
            health: 'healthy',
            ports: [],
            mounts: [],
            networks: [],
            restartPolicy: 'unless-stopped',
            createdBySentinel: false,
            lastSeenAt: '2026-05-15T15:00:00.000Z',
          },
          {
            id: 'radarr',
            displayName: 'Radarr',
            source: 'runtime_discovery',
            containerName: 'radarr',
            image: 'lscr.io/linuxserver/radarr:latest',
            status: 'exited',
            health: 'unhealthy',
            ports: [],
            mounts: [],
            networks: [],
            restartPolicy: 'unless-stopped',
            createdBySentinel: false,
            lastSeenAt: '2026-05-15T15:00:00.000Z',
          },
          {
            id: 'bazarr',
            displayName: 'Bazarr',
            source: 'runtime_discovery',
            containerName: 'bazarr',
            image: 'lscr.io/linuxserver/bazarr:latest',
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

    const result = await runChatLoop({
      message: 'what is unhealthy right now?',
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toContain('Unhealthy containers');
    expect(result).toContain('Radarr');
    expect(result).not.toContain('Bazarr');
    expect(callModel).not.toHaveBeenCalled();
  });

  it('returns a safe routed error when container logs cannot be read', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('model should not be called');
    });
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => {
        throw new Error('docker logs unavailable');
      },
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    await expect(
      runChatLoop({
        message: 'show me recent logs for sonarr',
        config: defaultConfig,
        toolRegistry: registry,
        callModel,
        hostname: 'cerebro',
      }),
    ).resolves.toContain('Unable to read recent logs for sonarr');

    expect(callModel).not.toHaveBeenCalled();
  });

  it('returns a safe routed error when host status cannot be read', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('model should not be called');
    });
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => {
        throw new Error('host command unavailable');
      },
    });

    await expect(
      runChatLoop({
        message: 'how is the host doing?',
        config: defaultConfig,
        toolRegistry: registry,
        callModel,
        hostname: 'cerebro',
      }),
    ).resolves.toContain('Unable to read host status');

    expect(callModel).not.toHaveBeenCalled();
  });

  it('answers host summary questions without calling the model', async () => {
    const callModel = vi.fn(async () => {
      throw new Error('model should not be called');
    });
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ schemaVersion: 1, counts: { total: 0, running: 0, stopped: 0 }, services: [] }),
      getContainerLogs: async () => 'unused',
      getHostStatus: async () => ({
        schemaVersion: 1,
        hostname: 'cerebro',
        platform: { kernel: 'Linux 6.8.0' },
        uptime: 'up 4 days',
        memory: { totalMb: 16384, usedMb: 4096, freeMb: 12288, availableMb: 12288 },
        rootDisk: {
          filesystem: '/dev/sda1',
          size: '100G',
          used: '40G',
          available: '60G',
          percentUsed: '40%',
          mountpoint: '/',
        },
        docker: {
          serverVersion: '28.2.2',
          composeVersion: '2.27.0',
        },
      }),
    });

    const result = await runChatLoop({
      message: 'how is the host doing?',
      config: defaultConfig,
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
    });

    expect(result).toContain('Host status');
    expect(result).toContain('cerebro');
    expect(callModel).not.toHaveBeenCalled();
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
    expect(callModel.mock.calls[1]?.[0]).toContain('AVAILABLE TOOLS:');
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

  it('falls back to deterministic inventory summary after repeated invalid model output for a near-match runtime question', async () => {
    const callModel = vi.fn(async () => 'definitely not valid json');
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
      message: "what's running in more detail?",
      config: {
        ...defaultConfig,
        agent: {
          ...defaultConfig.agent,
          max_json_repair_attempts: 1,
        },
      },
      toolRegistry: registry,
      callModel,
      hostname: 'cerebro',
      onTrace: (entry) => trace.push(entry),
    });

    expect(result).toContain('Sentinel runtime inventory');
    expect(result).toContain('Sonarr');
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'route_selected', route: 'inventory_summary' }),
        expect.objectContaining({ type: 'model_raw_output', output: 'definitely not valid json' }),
        expect.objectContaining({ type: 'model_parse_error' }),
        expect.objectContaining({ type: 'outcome', outcome: 'routed_response' }),
      ]),
    );
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
