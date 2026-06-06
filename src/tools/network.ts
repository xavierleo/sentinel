import { resolve as defaultResolve } from 'node:dns/promises';
import { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { execa as defaultExeca } from 'execa';
import { z } from 'zod';
import type { ToolDefinition } from './types.js';

type ExecaLike = (file: string, args: string[]) => Promise<{ stdout: string }>;
type ResolveLike = (name: string, type: DnsRecordType) => Promise<string[]>;
type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number;
  statusText: string;
  headers: Headers;
  text: () => Promise<string>;
}>;
type ProbeLike = (options: { host: string; port: number; timeoutMs: number }) => Promise<{
  connected: boolean;
  latencyMs: number;
}>;

const dnsRecordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'] as const;
type DnsRecordType = (typeof dnsRecordTypes)[number];

const netProbeSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().max(65_535),
  protocol: z.enum(['tcp']).default('tcp'),
  timeoutMs: z.number().int().positive().max(30_000).default(2000),
});

const netDnsSchema = z.object({
  name: z.string().min(1),
  type: z.enum(dnsRecordTypes).default('A'),
});

const netHttpSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
});

const emptySchema = z.object({});

function defaultTcpProbe(options: { host: string; port: number; timeoutMs: number }): Promise<{
  connected: boolean;
  latencyMs: number;
}> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const start = performance.now();

    socket.setTimeout(options.timeoutMs);
    socket.once('connect', () => {
      const latencyMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({ connected: true, latencyMs });
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('connection timed out'));
    });
    socket.once('error', (error) => {
      socket.destroy();
      reject(error);
    });
    socket.connect(options.port, options.host);
  });
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultHttpAllowlist(): string[] {
  return (process.env.SENTINEL_HTTP_ALLOWLIST ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedUrl(url: string, allowlist: string[]): boolean {
  const parsed = new URL(url);
  return allowlist.some((entry) => {
    const allowed = new URL(entry);
    return allowed.origin === parsed.origin;
  });
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function truncateBody(body: string, maxBodyBytes: number): { body: string; truncated: boolean } {
  const bytes = Buffer.from(body, 'utf8');
  if (bytes.byteLength <= maxBodyBytes) {
    return { body, truncated: false };
  }

  return {
    body: bytes.subarray(0, maxBodyBytes).toString('utf8'),
    truncated: true,
  };
}

function wrapUntrustedHttpBody(body: string, truncated: boolean): string {
  return [
    '<untrusted_http_response>',
    body,
    ...(truncated ? ['[truncated]'] : []),
    '</untrusted_http_response>',
  ].join('\n');
}

function flattenDnsRecords(records: unknown[]): string[] {
  return records.flatMap((record) => {
    if (Array.isArray(record)) {
      return record.map(String);
    }

    if (record && typeof record === 'object') {
      return [JSON.stringify(record)];
    }

    return [String(record)];
  });
}

function parseAddressPort(value: string): { address: string; port: number } | undefined {
  const match = /^(.*):(\d+)$/.exec(value);
  if (!match) {
    return undefined;
  }

  return {
    address: match[1].replace(/^\[|\]$/g, ''),
    port: Number(match[2]),
  };
}

function parseProcess(value: string | undefined): string | undefined {
  const match = /"([^"]+)"/.exec(value ?? '');
  return match?.[1];
}

function parseListeningPorts(stdout: string): Array<{
  protocol: string;
  address: string;
  port: number;
  process: string | undefined;
}> {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('Netid'))
    .flatMap((line) => {
      const parts = line.split(/\s+/);
      const local = parseAddressPort(parts[4]);
      if (!local) {
        return [];
      }

      return [
        {
          protocol: parts[0],
          address: local.address,
          port: local.port,
          process: parseProcess(parts.slice(6).join(' ')),
        },
      ];
    });
}

function parseRoutes(stdout: string): Array<{ destination: string; gateway: string | undefined; device: string | undefined }> {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const viaIndex = parts.indexOf('via');
      const devIndex = parts.indexOf('dev');
      return {
        destination: parts[0],
        gateway: viaIndex >= 0 ? parts[viaIndex + 1] : undefined,
        device: devIndex >= 0 ? parts[devIndex + 1] : undefined,
      };
    });
}

export function createNetProbeTool(options: { probe?: ProbeLike } = {}): ToolDefinition<
  z.input<typeof netProbeSchema>,
  {
    host: string;
    port: number;
    protocol: 'tcp';
    reachable: boolean;
    latencyMs: number | undefined;
    error: string | undefined;
  }
> {
  const probe = options.probe ?? defaultTcpProbe;

  return {
    name: 'net_probe',
    description: 'Probe TCP connectivity to a host and port.',
    schema: netProbeSchema,
    annotations: { readOnly: true, network: true },
    async execute(args) {
      const parsed = netProbeSchema.parse(args);
      try {
        const result = await probe({ host: parsed.host, port: parsed.port, timeoutMs: parsed.timeoutMs });
        return {
          host: parsed.host,
          port: parsed.port,
          protocol: parsed.protocol,
          reachable: result.connected,
          latencyMs: result.latencyMs,
          error: undefined,
        };
      } catch (error) {
        return {
          host: parsed.host,
          port: parsed.port,
          protocol: parsed.protocol,
          reachable: false,
          latencyMs: undefined,
          error: normalizeError(error),
        };
      }
    },
  };
}

export function createNetDnsTool(options: { resolve?: ResolveLike } = {}): ToolDefinition<
  z.input<typeof netDnsSchema>,
  { name: string; type: DnsRecordType; records: string[] }
> {
  const resolve = options.resolve ?? (defaultResolve as ResolveLike);

  return {
    name: 'net_dns',
    description: 'Resolve DNS records for a hostname.',
    schema: netDnsSchema,
    annotations: { readOnly: true, network: true },
    async execute(args) {
      const parsed = netDnsSchema.parse(args);
      const records = await resolve(parsed.name, parsed.type);
      return {
        name: parsed.name,
        type: parsed.type,
        records: flattenDnsRecords(records),
      };
    },
  };
}

export function createNetHttpTool(options: {
  fetch?: FetchLike;
  allowlist?: string[];
  maxBodyBytes?: number;
} = {}): ToolDefinition<
  z.input<typeof netHttpSchema>,
  | {
      url: string;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      truncated: boolean;
    }
  | { error: string; suggestion: string }
> {
  const fetch = options.fetch ?? (globalThis.fetch as FetchLike);
  const allowlist = options.allowlist ?? defaultHttpAllowlist();
  const maxBodyBytes = options.maxBodyBytes ?? 4096;

  return {
    name: 'net_http',
    description: 'Send an allowlisted HTTP request and return the response body wrapped as untrusted data.',
    schema: netHttpSchema,
    annotations: { readOnly: true, network: true },
    async execute(args) {
      const parsed = netHttpSchema.parse(args);
      if (!isAllowedUrl(parsed.url, allowlist)) {
        return {
          error: 'URL is not allowed',
          suggestion: 'Add the URL origin to the network HTTP allowlist before retrying.',
        };
      }

      const response = await fetch(parsed.url, {
        method: parsed.method,
        headers: parsed.headers,
        body: parsed.body,
      });
      const text = await response.text();
      const truncated = truncateBody(text, maxBodyBytes);

      return {
        url: parsed.url,
        status: response.status,
        statusText: response.statusText,
        headers: headersToObject(response.headers),
        body: wrapUntrustedHttpBody(truncated.body, truncated.truncated),
        truncated: truncated.truncated,
      };
    },
  };
}

export function createNetListeningPortsTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof emptySchema>,
  { ports: Array<{ protocol: string; address: string; port: number; process: string | undefined }> }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'net_listening_ports',
    description: 'List local listening TCP/UDP ports using ss.',
    schema: emptySchema,
    annotations: { readOnly: true },
    async execute() {
      const result = await execa('ss', ['-tunlp']);
      return { ports: parseListeningPorts(result.stdout) };
    },
  };
}

export function createNetRoutesTool(options: { execa?: ExecaLike } = {}): ToolDefinition<
  z.input<typeof emptySchema>,
  { routes: Array<{ destination: string; gateway: string | undefined; device: string | undefined }> }
> {
  const execa = options.execa ?? defaultExeca;

  return {
    name: 'net_routes',
    description: 'List local network routes using ip route.',
    schema: emptySchema,
    annotations: { readOnly: true },
    async execute() {
      const result = await execa('ip', ['route']);
      return { routes: parseRoutes(result.stdout) };
    },
  };
}
