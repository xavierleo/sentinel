import { createServer, type Server } from 'node:http';

export interface HealthServerOptions {
  host: string;
  port: number;
  isReady: () => boolean;
}

export interface StartedHealthServer {
  url: string;
  stop: () => Promise<void>;
}

export function createHealthServer(options: HealthServerOptions) {
  return {
    start(): Promise<StartedHealthServer> {
      const server = createServer((request, response) => {
        if (request.url !== '/healthz') {
          response.statusCode = 404;
          response.end('not found');
          return;
        }

        const ready = options.isReady();
        response.statusCode = ready ? 200 : 503;
        response.end(ready ? 'ok' : 'not ready');
      });

      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, () => {
          server.off('error', reject);
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : options.port;
          resolve({
            url: `http://${options.host}:${port}`,
            stop: () => stopServer(server),
          });
        });
      });
    },
  };
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
