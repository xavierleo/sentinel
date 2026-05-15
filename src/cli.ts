import { getVersionLabel } from './index.js';

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

const usage = `Usage: sentinel <command>

Commands:
  --version, -v   Print version information
  --help, -h      Show this help
  status          Show local installation status
  inventory       Show runtime inventory status
  daemon          Start daemon (not implemented yet)
  chat            Start chat client (not implemented yet)
  tui             Start TUI client (not implemented yet)`;

const defaultIo: CliIo = {
  stdout: (message: string) => console.log(message),
  stderr: (message: string) => console.error(message),
};

function printNotImplemented(command: string, io: CliIo): number {
  io.stderr(`${command} is not implemented yet in Sentinel v1.0 foundation.`);
  return 2;
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command] = argv;

  switch (command) {
    case undefined:
    case '--help':
    case '-h':
      io.stdout(usage);
      return 0;

    case '--version':
    case '-v':
      io.stdout(getVersionLabel());
      return 0;

    case 'status':
      io.stdout(`Sentinel status
Foundation: installed
Daemon: not implemented yet
Chat: not implemented yet
TUI: not implemented yet`);
      return 0;

    case 'inventory':
      io.stderr('Docker discovery is not implemented yet. Runtime inventory will be wired in the next milestone.');
      return 2;

    case 'daemon':
    case 'chat':
    case 'tui':
      return printNotImplemented(command, io);

    default:
      io.stderr(`Unknown command: ${command}`);
      io.stdout(usage);
      return 1;
  }
}
