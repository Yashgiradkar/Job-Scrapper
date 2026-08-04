import { createServer } from 'node:http';
import { createApplication } from './composition-root.js';
import { getConfig } from './infrastructure/config/config.js';
import { resetBrowserManager } from './infrastructure/browser/browser-manager.js';
import { disconnectPrisma } from './infrastructure/database/prisma-client.js';
import { logger } from './infrastructure/logging/logger.js';

const config = getConfig();
const app = createApplication();
const server = createServer(app);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Shutting down application');

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'Failed to close HTTP server');
      process.exitCode = 1;
    }

    await resetBrowserManager();
    await disconnectPrisma();
    process.exit();
  });
}

process.on('SIGINT', (signal) => {
  void shutdown(signal);
});

process.on('SIGTERM', (signal) => {
  void shutdown(signal);
});

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'Job scraper API listening');
});
