import { pathToFileURL } from 'node:url';
import { runCli, versionLabel } from './cli.js';

export function getVersionLabel(): string {
  return versionLabel;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
