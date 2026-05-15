import { pathToFileURL } from 'node:url';
import { runCli } from './cli.js';

export function getVersionLabel(): string {
  return 'Sentinel v1.0 Runtime Awareness';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
