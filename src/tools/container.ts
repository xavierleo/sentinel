import { execa as defaultExeca } from 'execa';
import { z } from 'zod';
import type { ToolDefinition } from './types.js';

type ExecaLike = (file: string, args: string[]) => Promise<{ stdout: string }>;

const containerListSchema = z.object({
  filter: z.string().optional(),
});

const containerNameSchema = z.object({
  name: z.string().min(1),
});

const containerLogsSchema = z.object({
  name: z.string().min(1),
  lines: z.number().int().positive().max(500).default(100),
  since: z.string().optional(),
});

const containerActionSchema = z.object({
  name: z.string().min(1),
  action: z.enum(['start', 'stop', 'restart', 'remove', 'pause', 'unpause']),
  dry_run: z.boolean().default(true),
});

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

interface DockerPsRow {
  ID?: string;
  Names?: string;
  Image?: string;
  State?: string;
  Status?: string;
  Ports?: string;
}

interface DockerInspectRow {
  Id?: string;
  Name?: string;
  Config?: {
    Image?: string;
  };
  State?: {
    Status?: string;
    Health?: {
      Status?: string;
    };
  };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
  Mounts?: Array<{
    Type?: string;
    Source?: string;
    Destination?: string;
  }>;
}

interface DockerStatsRow {
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  MemPerc?: string;
  NetIO?: string;
  BlockIO?: string;
  PIDs?: string;
}

function parsePercent(value: string | undefined): number {
  return Number((value ?? '0').replace('%', ''));
}

function parseInteger(value: string | undefined): number {
  return Number.parseInt(value ?? '0', 10);
}

export function createContainerListTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.infer<typeof containerListSchema>,
  { containers: ContainerSummary[] }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'container_list',
    description: 'List local Docker containers using docker ps --all.',
    schema: containerListSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const dockerArgs = ['ps', '--all', '--format', '{{json .}}'];
      if (args.filter) {
        dockerArgs.push('--filter', args.filter);
      }

      const result = await execa('docker', dockerArgs);
      const containers = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as DockerPsRow)
        .map((row) => ({
          id: row.ID ?? '',
          name: row.Names ?? '',
          image: row.Image ?? '',
          state: row.State ?? '',
          status: row.Status ?? '',
          ports: row.Ports ?? '',
        }));

      return { containers };
    },
  };
}

export function createContainerInspectTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof containerNameSchema>,
  {
    id: string;
    name: string;
    image: string;
    state: string;
    health: string | undefined;
    ports: { containerPort: string; hostIp: string; hostPort: string }[];
    mounts: { type: string; source: string; destination: string }[];
  }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'container_inspect',
    description: 'Inspect a Docker container and return normalized configuration, state, ports, and mounts.',
    schema: containerNameSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = containerNameSchema.parse(args);
      const result = await execa('docker', ['inspect', parsed.name]);
      const [row] = JSON.parse(result.stdout) as DockerInspectRow[];

      return {
        id: row?.Id ?? '',
        name: (row?.Name ?? parsed.name).replace(/^\//, ''),
        image: row?.Config?.Image ?? '',
        state: row?.State?.Status ?? '',
        health: row?.State?.Health?.Status,
        ports: Object.entries(row?.NetworkSettings?.Ports ?? {}).flatMap(([containerPort, bindings]) =>
          (bindings ?? []).map((binding) => ({
            containerPort,
            hostIp: binding.HostIp ?? '',
            hostPort: binding.HostPort ?? '',
          })),
        ),
        mounts: (row?.Mounts ?? []).map((mount) => ({
          type: mount.Type ?? '',
          source: mount.Source ?? '',
          destination: mount.Destination ?? '',
        })),
      };
    },
  };
}

export function createContainerLogsTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof containerLogsSchema>,
  { name: string; logs: string }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'container_logs',
    description: 'Read recent logs for a Docker container.',
    schema: containerLogsSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = containerLogsSchema.parse(args);
      const dockerArgs = ['logs', '--tail', String(parsed.lines)];
      if (parsed.since) {
        dockerArgs.push('--since', parsed.since);
      }
      dockerArgs.push(parsed.name);

      const result = await execa('docker', dockerArgs);
      return { name: parsed.name, logs: result.stdout };
    },
  };
}

export function createContainerStatsTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof containerNameSchema>,
  {
    name: string;
    cpuPercent: number;
    memoryUsage: string;
    memoryPercent: number;
    networkIo: string;
    blockIo: string;
    pids: number;
  }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'container_stats',
    description: 'Read a one-shot Docker stats sample for a container.',
    schema: containerNameSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = containerNameSchema.parse(args);
      const result = await execa('docker', ['stats', '--no-stream', '--format', '{{json .}}', parsed.name]);
      const row = JSON.parse(result.stdout) as DockerStatsRow;

      return {
        name: row.Name ?? parsed.name,
        cpuPercent: parsePercent(row.CPUPerc),
        memoryUsage: row.MemUsage ?? '',
        memoryPercent: parsePercent(row.MemPerc),
        networkIo: row.NetIO ?? '',
        blockIo: row.BlockIO ?? '',
        pids: parseInteger(row.PIDs),
      };
    },
  };
}

export function createContainerActionTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof containerActionSchema>,
  { name: string; action: string; dryRun: boolean; executed: boolean }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'container_action',
    description: 'Perform a Docker container lifecycle action. Defaults to dry-run and requires permission for execution.',
    schema: containerActionSchema,
    annotations: { destructive: true, idempotent: false },
    async execute(args) {
      const parsed = containerActionSchema.parse(args);
      if (parsed.dry_run) {
        return {
          name: parsed.name,
          action: parsed.action,
          dryRun: true,
          executed: false,
        };
      }

      await execa('docker', [parsed.action, parsed.name]);

      return {
        name: parsed.name,
        action: parsed.action,
        dryRun: false,
        executed: true,
      };
    },
  };
}
