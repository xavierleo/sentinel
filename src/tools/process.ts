import { execa as defaultExeca } from 'execa';
import { z } from 'zod';
import type { ToolDefinition } from './types.js';

type ExecaLike = (
  file: string,
  args: string[],
  options?: { timeout?: number; reject?: boolean },
) => Promise<{ stdout: string; stderr?: string; exitCode?: number }>;

const shellExecSchema = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(30_000).default(10_000),
  dry_run: z.boolean().default(true),
});

const systemdListUnitsSchema = z.object({
  state: z.string().optional(),
});

const systemdStatusSchema = z.object({
  unit: z.string().min(1),
});

const systemdActionSchema = z.object({
  unit: z.string().min(1),
  action: z.enum(['start', 'stop', 'restart', 'reload']),
  dry_run: z.boolean().default(true),
});

interface SystemdUnitRow {
  unit?: string;
  load?: string;
  active?: string;
  sub?: string;
  description?: string;
}

function parseSystemdShow(stdout: string): Record<string, string> {
  return Object.fromEntries(
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        return index >= 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ''];
      }),
  );
}

export function createShellExecTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof shellExecSchema>,
  | { command: string; dryRun: true; executed: false }
  | { command: string; dryRun: false; executed: true; stdout: string; stderr: string; exitCode: number }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'shell_exec',
    description: 'Run a shell command. Defaults to dry-run and requires explicit permission for execution.',
    schema: shellExecSchema,
    annotations: { destructive: true, idempotent: false },
    async execute(args) {
      const parsed = shellExecSchema.parse(args);
      if (parsed.dry_run) {
        return {
          command: parsed.command,
          dryRun: true,
          executed: false,
        };
      }

      const result = await execa('sh', ['-lc', parsed.command], { timeout: parsed.timeoutMs, reject: false });
      return {
        command: parsed.command,
        dryRun: false,
        executed: true,
        stdout: result.stdout,
        stderr: result.stderr ?? '',
        exitCode: result.exitCode ?? 0,
      };
    },
  };
}

export function createSystemdListUnitsTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof systemdListUnitsSchema>,
  { units: Array<{ name: string; load: string; active: string; sub: string; description: string }> }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'systemd_list_units',
    description: 'List systemd service units using systemctl list-units.',
    schema: systemdListUnitsSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = systemdListUnitsSchema.parse(args);
      const systemctlArgs = ['list-units', '--type=service', '--all', '--output=json'];
      if (parsed.state) {
        systemctlArgs.push(`--state=${parsed.state}`);
      }

      const result = await execa('systemctl', systemctlArgs);
      const rows = JSON.parse(result.stdout) as SystemdUnitRow[];
      return {
        units: rows.map((row) => ({
          name: row.unit ?? '',
          load: row.load ?? '',
          active: row.active ?? '',
          sub: row.sub ?? '',
          description: row.description ?? '',
        })),
      };
    },
  };
}

export function createSystemdStatusTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof systemdStatusSchema>,
  { unit: string; loadState: string; activeState: string; subState: string }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'systemd_status',
    description: 'Read systemd service status using systemctl show.',
    schema: systemdStatusSchema,
    annotations: { readOnly: true },
    async execute(args) {
      const parsed = systemdStatusSchema.parse(args);
      const result = await execa('systemctl', [
        'show',
        parsed.unit,
        '--property=Id,LoadState,ActiveState,SubState',
      ]);
      const values = parseSystemdShow(result.stdout);
      return {
        unit: values.Id ?? parsed.unit,
        loadState: values.LoadState ?? '',
        activeState: values.ActiveState ?? '',
        subState: values.SubState ?? '',
      };
    },
  };
}

export function createSystemdActionTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof systemdActionSchema>,
  { unit: string; action: string; dryRun: boolean; executed: boolean }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'systemd_action',
    description: 'Perform a systemd service lifecycle action. Defaults to dry-run and requires permission for execution.',
    schema: systemdActionSchema,
    annotations: { destructive: true, idempotent: false },
    async execute(args) {
      const parsed = systemdActionSchema.parse(args);
      if (parsed.dry_run) {
        return {
          unit: parsed.unit,
          action: parsed.action,
          dryRun: true,
          executed: false,
        };
      }

      await execa('systemctl', [parsed.action, parsed.unit], { reject: false });
      return {
        unit: parsed.unit,
        action: parsed.action,
        dryRun: false,
        executed: true,
      };
    },
  };
}
