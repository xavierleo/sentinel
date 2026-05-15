#!/usr/bin/env node

// src/index.ts
import { pathToFileURL } from "url";

// src/cli.ts
var usage = `Usage: sentinel <command>

Commands:
  --version, -v   Print version information
  --help, -h      Show this help
  status          Show local installation status
  inventory       Show runtime inventory status
  daemon          Start daemon (not implemented yet)
  chat            Start chat client (not implemented yet)
  tui             Start TUI client (not implemented yet)`;
var defaultIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message)
};
function printNotImplemented(command, io) {
  io.stderr(`${command} is not implemented yet in Sentinel v1.0 foundation.`);
  return 2;
}
async function runCli(argv, io = defaultIo) {
  const [command] = argv;
  switch (command) {
    case void 0:
    case "--help":
    case "-h":
      io.stdout(usage);
      return 0;
    case "--version":
    case "-v":
      io.stdout(getVersionLabel());
      return 0;
    case "status":
      io.stdout(`Sentinel status
Foundation: installed
Daemon: not implemented yet
Chat: not implemented yet
TUI: not implemented yet`);
      return 0;
    case "inventory":
      io.stderr("Docker discovery is not implemented yet. Runtime inventory will be wired in the next milestone.");
      return 2;
    case "daemon":
    case "chat":
    case "tui":
      return printNotImplemented(command, io);
    default:
      io.stderr(`Unknown command: ${command}`);
      io.stdout(usage);
      return 1;
  }
}

// src/index.ts
function getVersionLabel() {
  return "Sentinel v1.0 Runtime Awareness";
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
export {
  getVersionLabel
};
