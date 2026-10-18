import { createApp } from './app.js';
import { env } from './config/env.js';
import { createDatabase } from './db/client.js';
import { ensureSeeded } from './import/seedService.js';
import { logger } from './lib/logger.js';

const database = createDatabase({
  databaseUrl: env.DATABASE_URL,
  pgliteDataDir: env.PGLITE_DATA_DIR,
  logger,
});

async function start(): Promise<void> {
  logger.info({ database: database.kind }, 'Applying database migrations');
  await database.migrate();
  await ensureSeeded({ db: database.db, filePath: env.SEED_FILE_PATH, logger });

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'RealEstateLens server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void database.close().finally(() => {
        process.exit(0);
      });
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err: unknown) => {
  logger.fatal({ err }, 'Server failed to start');
  process.exit(1);
});
