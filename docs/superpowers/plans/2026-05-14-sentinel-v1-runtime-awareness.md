# Sentinel v1.0 Runtime Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Sentinel v1.0 flow: install the TypeScript foundation, discover Docker/host runtime state, store inventory, and answer "what's running?" through typed read-only tools.

**Architecture:** Sentinel v1.0 is a local Node 22 TypeScript app with focused modules for config, command execution, discovery, storage, typed tools, and the agent loop. The first release keeps filesystem reads and actions out of scope, but it shapes the code so v1.1/v1.2 gates can plug in without rewriting the core.

**Tech Stack:** TypeScript, Node 22, Vitest, tsup, Zod, execa, better-sqlite3, YAML, Ollama HTTP API, Ink later in the milestone.

---

## File Structure

- `package.json`: npm scripts, runtime dependencies, dev dependencies.
- `tsconfig.json`: strict TypeScript compiler settings.
- `tsup.config.ts`: Node-targeted build config.
- `vitest.config.ts`: test runner config.
- `src/index.ts`: process entrypoint and command dispatch.
- `src/cli.ts`: CLI command parser for `daemon`, `chat`, `status`, and `inventory`.
- `src/config/schema.ts`: Zod schema for Sentinel config.
- `src/config/defaults.ts`: default config object.
- `src/config/loader.ts`: load YAML config and merge defaults.
- `src/shared/command.ts`: safe subprocess wrapper around `execa`.
- `src/discovery/docker.ts`: Docker `ps`, `inspect`, logs, networks, and volumes discovery.
- `src/discovery/host.ts`: host status discovery.
- `src/discovery/runtime-profile.ts`: convert Docker data into normalized runtime profiles.
- `src/discovery/runtime-inventory.ts`: orchestrate complete inventory refresh.
- `src/storage/db.ts`: SQLite connection, migrations, WAL mode.
- `src/storage/inventory.ts`: persist snapshots and normalized service profiles.
- `src/tools/index.ts`: typed tool registry.
- `src/tools/containers.ts`: read-only container tools.
- `src/tools/host.ts`: read-only host tools.
- `src/agent/decision-schema.ts`: strict model decision schema.
- `src/agent/decision-parser.ts`: JSON parse and validation repair boundary.
- `src/agent/context.ts`: compact context builder for runtime inventory.
- `src/ollama/client.ts`: local Ollama API client.
- `tests/**`: Vitest tests mirroring source modules.

---

### Task 1: Project Scaffold And Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```typescript
// tests/smoke.test.ts
import { describe, expect, it } from 'vitest';
import { getVersionLabel } from '../src/index';

describe('project scaffold', () => {
  it('exposes a Sentinel version label', () => {
    expect(getVersionLabel()).toBe('Sentinel v1.0 Runtime Awareness');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/smoke.test.ts`

Expected: FAIL because `package.json`, Vitest, or `src/index.ts` does not exist yet.

- [ ] **Step 3: Add minimal scaffold**

```json
// package.json
{
  "name": "sentinel-homelab-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "sentinel": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22"
  },
  "dependencies": {
    "better-sqlite3": "^11.10.0",
    "execa": "^9.5.2",
    "yaml": "^2.7.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.13.5",
    "tsup": "^8.3.6",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  dts: true,
  target: 'node22',
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

```typescript
// src/index.ts
export function getVersionLabel(): string {
  return 'Sentinel v1.0 Runtime Awareness';
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/smoke.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 2: Config Schema And Loader

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/loader.ts`
- Create: `tests/config/loader.test.ts`

- [ ] **Step 1: Write failing config tests**

```typescript
// tests/config/loader.test.ts
import { describe, expect, it } from 'vitest';
import { loadConfigFromString } from '../../src/config/loader';

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

  it('rejects invalid refresh intervals', () => {
    expect(() =>
      loadConfigFromString(`
runtime_inventory:
  refresh_interval: tomorrow
`),
    ).toThrow(/refresh_interval/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config/loader.test.ts`

Expected: FAIL because config modules do not exist.

- [ ] **Step 3: Implement config schema and loader**

```typescript
// src/config/schema.ts
import { z } from 'zod';

const durationSchema = z.string().regex(/^\d+[smhd]$/, 'refresh_interval must look like 30s, 5m, 1h, or 1d');

export const sentinelConfigSchema = z.object({
  agent: z.object({
    model: z.string().min(1),
    model_profile: z.enum(['fast', 'balanced', 'smarter']),
    ollama_url: z.string().url(),
    temperature: z.number().min(0).max(2),
    max_tool_calls_per_request: z.number().int().positive(),
    max_json_repair_attempts: z.number().int().nonnegative(),
    max_tool_result_chars: z.number().int().positive(),
    max_log_lines_default: z.number().int().positive(),
  }),
  runtime_inventory: z.object({
    refresh_interval: durationSchema,
    store_snapshots: z.boolean(),
  }),
  detection: z.object({
    stacks_dir: z.string(),
    common_stack_dirs: z.array(z.string()),
  }),
  channels: z.object({
    terminal: z.object({
      enabled: z.boolean(),
    }),
  }),
  tui: z.object({
    theme: z.enum(['colourful']),
    show_tool_trace: z.boolean(),
    show_watchtower_panel: z.boolean(),
    colour_mode: z.enum(['auto', 'truecolor', '256', 'mono']),
  }),
  permissions: z.object({
    trusted_paths: z.array(z.string()),
  }),
  actions: z.object({
    require_approval: z.boolean(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
  }),
});

export type SentinelConfig = z.infer<typeof sentinelConfigSchema>;
```

```typescript
// src/config/defaults.ts
import type { SentinelConfig } from './schema';

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
  logging: {
    level: 'info',
  },
};
```

```typescript
// src/config/loader.ts
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { defaultConfig } from './defaults';
import { sentinelConfigSchema, type SentinelConfig } from './schema';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) {
    return override === undefined ? base : (override as T);
  }

  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeDeep((base as JsonObject)[key], value);
  }
  return merged as T;
}

export function loadConfigFromString(source: string): SentinelConfig {
  const parsed = YAML.parse(source) ?? {};
  const merged = mergeDeep(defaultConfig, parsed);
  return sentinelConfigSchema.parse(merged);
}

export async function loadConfig(path = '/etc/sentinel/sentinel.yml'): Promise<SentinelConfig> {
  const source = await readFile(path, 'utf8');
  return loadConfigFromString(source);
}
```

- [ ] **Step 4: Run config tests**

Run: `npm test -- tests/config/loader.test.ts`

Expected: PASS.

---

### Task 3: Decision Schema And Parser

**Files:**
- Create: `src/agent/decision-schema.ts`
- Create: `src/agent/decision-parser.ts`
- Create: `tests/agent/decision-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

```typescript
// tests/agent/decision-parser.test.ts
import { describe, expect, it } from 'vitest';
import { parseDecision } from '../../src/agent/decision-parser';

describe('decision parser', () => {
  it('accepts respond decisions', () => {
    const decision = parseDecision('{"thought":"done","action":"respond","response":"ok"}');
    expect(decision).toEqual({ thought: 'done', action: 'respond', response: 'ok' });
  });

  it('accepts tool call decisions with args', () => {
    const decision = parseDecision('{"thought":"inspect","action":"tool_call","tool":"list_containers","args":{}}');
    expect(decision.action).toBe('tool_call');
    expect(decision.tool).toBe('list_containers');
  });

  it('rejects schedule decisions in v1.x', () => {
    expect(() => parseDecision('{"thought":"later","action":"schedule"}')).toThrow(/Scheduling is not available/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseDecision('{nope')).toThrow(/Invalid JSON/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/agent/decision-parser.test.ts`

Expected: FAIL because parser modules do not exist.

- [ ] **Step 3: Implement strict decision parser**

```typescript
// src/agent/decision-schema.ts
import { z } from 'zod';

export const respondDecisionSchema = z.object({
  thought: z.string().min(1),
  action: z.literal('respond'),
  response: z.string(),
});

export const toolCallDecisionSchema = z.object({
  thought: z.string().min(1),
  action: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.unknown()).default({}),
});

export const decisionSchema = z.discriminatedUnion('action', [
  respondDecisionSchema,
  toolCallDecisionSchema,
]);

export type AgentDecision = z.infer<typeof decisionSchema>;
```

```typescript
// src/agent/decision-parser.ts
import { ZodError } from 'zod';
import { decisionSchema, type AgentDecision } from './decision-schema';

export function parseDecision(raw: string): AgentDecision {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON decision returned by model');
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'action' in parsed &&
    (parsed as { action: unknown }).action === 'schedule'
  ) {
    throw new Error('Scheduling is not available in Sentinel v1.x');
  }

  try {
    return decisionSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Invalid decision shape: ${error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run parser tests**

Run: `npm test -- tests/agent/decision-parser.test.ts`

Expected: PASS.

---

### Task 4: Runtime Profile Model

**Files:**
- Create: `src/discovery/runtime-profile.ts`
- Create: `tests/discovery/runtime-profile.test.ts`

- [ ] **Step 1: Write failing profile tests**

```typescript
// tests/discovery/runtime-profile.test.ts
import { describe, expect, it } from 'vitest';
import { buildRuntimeProfile } from '../../src/discovery/runtime-profile';

describe('runtime profile builder', () => {
  it('normalizes Docker container data into a runtime service profile', () => {
    const profile = buildRuntimeProfile({
      id: 'abc123',
      name: '/sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      state: 'running',
      health: undefined,
      labels: {
        'com.docker.compose.project': 'media',
        'com.docker.compose.service': 'sonarr',
        'com.docker.compose.project.working_dir': '/opt/stacks/media',
      },
      ports: [{ host: 8989, container: 8989, protocol: 'tcp' }],
      mounts: [{ host: '/opt/appdata/sonarr', container: '/config', mode: 'rw' }],
      networks: ['media_default'],
      restartPolicy: 'unless-stopped',
      createdAt: '2026-05-14T12:00:00+02:00',
    });

    expect(profile).toMatchObject({
      id: 'sonarr',
      displayName: 'Sonarr',
      source: 'runtime_discovery',
      containerName: 'sonarr',
      image: 'lscr.io/linuxserver/sonarr:latest',
      status: 'running',
      health: 'unknown',
      composeProject: 'media',
      composeService: 'sonarr',
      stackDir: '/opt/stacks/media',
      createdBySentinel: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/discovery/runtime-profile.test.ts`

Expected: FAIL because profile module does not exist.

- [ ] **Step 3: Implement profile builder**

```typescript
// src/discovery/runtime-profile.ts
export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  health?: string;
  labels: Record<string, string>;
  ports: RuntimeServicePort[];
  mounts: RuntimeServiceMount[];
  networks: string[];
  restartPolicy: string;
  createdAt: string;
}

export interface RuntimeServicePort {
  host: number;
  container: number;
  protocol: 'tcp' | 'udp';
}

export interface RuntimeServiceMount {
  host: string;
  container: string;
  mode: string;
}

export interface RuntimeServiceProfile {
  id: string;
  displayName: string;
  source: 'runtime_discovery';
  containerName: string;
  image: string;
  status: string;
  health: string;
  composeProject?: string;
  composeService?: string;
  stackDir?: string;
  ports: RuntimeServicePort[];
  mounts: RuntimeServiceMount[];
  networks: string[];
  restartPolicy: string;
  createdBySentinel: false;
  lastSeenAt: string;
}

function cleanContainerName(name: string): string {
  return name.replace(/^\//, '');
}

function toDisplayName(name: string): string {
  return name
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildRuntimeProfile(container: DockerContainerSummary): RuntimeServiceProfile {
  const containerName = cleanContainerName(container.name);

  return {
    id: containerName,
    displayName: toDisplayName(containerName),
    source: 'runtime_discovery',
    containerName,
    image: container.image,
    status: container.state,
    health: container.health ?? 'unknown',
    composeProject: container.labels['com.docker.compose.project'],
    composeService: container.labels['com.docker.compose.service'],
    stackDir: container.labels['com.docker.compose.project.working_dir'],
    ports: container.ports,
    mounts: container.mounts,
    networks: container.networks,
    restartPolicy: container.restartPolicy,
    createdBySentinel: false,
    lastSeenAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run profile tests**

Run: `npm test -- tests/discovery/runtime-profile.test.ts`

Expected: PASS.

---

### Task 5: Read-Only Tool Registry

**Files:**
- Create: `src/tools/index.ts`
- Create: `src/tools/containers.ts`
- Create: `src/tools/host.ts`
- Create: `tests/tools/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

```typescript
// tests/tools/registry.test.ts
import { describe, expect, it } from 'vitest';
import { createToolRegistry } from '../../src/tools';

describe('tool registry', () => {
  it('only exposes v1.0 read-only tools', () => {
    const registry = createToolRegistry({
      getRuntimeInventory: async () => ({ services: [], host: { hostname: 'cerebro' } }),
      getContainerLogs: async () => 'log line',
      getHostStatus: async () => ({ hostname: 'cerebro' }),
    });

    expect(registry.listToolNames()).toEqual([
      'container_logs',
      'get_runtime_inventory',
      'host_status',
      'list_containers',
    ]);
    expect(registry.get('restart_container')).toBeUndefined();
    expect(registry.get('read_file')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/registry.test.ts`

Expected: FAIL because tool modules do not exist.

- [ ] **Step 3: Implement minimal read-only registry**

```typescript
// src/tools/index.ts
export interface ToolDefinition {
  name: string;
  description: string;
  tier: 'system_read';
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolDependencies {
  getRuntimeInventory: () => Promise<unknown>;
  getContainerLogs: (name: string, lines?: number) => Promise<string>;
  getHostStatus: () => Promise<unknown>;
}

export function createToolRegistry(deps: ToolDependencies) {
  const tools = new Map<string, ToolDefinition>();

  tools.set('get_runtime_inventory', {
    name: 'get_runtime_inventory',
    description: 'Returns compact current runtime inventory summary.',
    tier: 'system_read',
    run: () => deps.getRuntimeInventory(),
  });

  tools.set('list_containers', {
    name: 'list_containers',
    description: 'Returns all discovered runtime service profiles.',
    tier: 'system_read',
    run: async () => {
      const inventory = (await deps.getRuntimeInventory()) as { services?: unknown[] };
      return inventory.services ?? [];
    },
  });

  tools.set('container_logs', {
    name: 'container_logs',
    description: 'Returns recent Docker logs for a container, truncated by default.',
    tier: 'system_read',
    run: (args) => deps.getContainerLogs(String(args.name), typeof args.lines === 'number' ? args.lines : undefined),
  });

  tools.set('host_status', {
    name: 'host_status',
    description: 'Returns compact host status.',
    tier: 'system_read',
    run: () => deps.getHostStatus(),
  });

  return {
    get(name: string): ToolDefinition | undefined {
      return tools.get(name);
    },
    listToolNames(): string[] {
      return [...tools.keys()].sort();
    },
  };
}
```

```typescript
// src/tools/containers.ts
export {};
```

```typescript
// src/tools/host.ts
export {};
```

- [ ] **Step 4: Run registry tests**

Run: `npm test -- tests/tools/registry.test.ts`

Expected: PASS.

---

### Task 6: Phase 1 Verification

**Files:**
- Modify as needed only to fix failing tests from Tasks 1-5.

- [ ] **Step 1: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `dist/index.js` is generated.

- [ ] **Step 2: Document current limitation**

Add a short section to `README.md`:

```markdown
# Sentinel Homelab Agent

Sentinel v1.0 is currently building the Runtime Awareness foundation.

The first milestone is:

```text
Fresh install -> daemon discovers Docker state -> sentinel chat -> "what's running?" -> accurate answer
```

Filesystem reads, container actions, Telegram, scheduling, service APIs, and provisioning are intentionally out of scope for v1.0.
```

- [ ] **Step 3: Run verification again**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

---

## Self-Review

- Spec coverage: This plan covers the v1.0 foundation from the PRD: scaffold, config, strict decision parsing, runtime profiles, read-only tool registry, and verification. It intentionally does not implement filesystem permissions, approval-gated actions, Telegram, scheduling, service APIs, or provisioning.
- Placeholder scan: No task contains TBD/TODO placeholders. Later-phase modules are explicitly excluded or stubbed.
- Type consistency: Tool names, config keys, and runtime profile field names match the PRD and are used consistently across tests and implementation snippets.

