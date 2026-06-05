import { execa as defaultExeca } from 'execa';
import { z } from 'zod';
import type { ToolDefinition } from './types.js';

type ExecaLike = (file: string, args: string[]) => Promise<{ stdout: string }>;

const containerListSchema = z.object({
  filter: z.string().optional(),
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
