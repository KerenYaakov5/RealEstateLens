import { createApp } from './app.js';
import { CbsClient } from './clients/cbs/cbsClient.js';
import { HttpClient } from './clients/httpClient.js';
import { env } from './config/env.js';
import { createDatabase } from './db/client.js';
import { ensureSeeded } from './import/seedService.js';
import { logger } from './lib/logger.js';
import { DealRepository } from './repositories/deal.repository.js';
import { PriceIndexRepository } from './repositories/priceIndex.repository.js';
import { PriceIndexService } from './services/priceIndex.service.js';

const database = createDatabase({
  databaseUrl: env.DATABASE_URL,
  pgliteDataDir: env.PGLITE_DATA_DIR,
  logger,
});

async function start(): Promise<void> {
  logger.info({ database: database.kind }, 'Applying database migrations');
  await database.migrate();
  await ensureSeeded({ db: database.db, filePath: env.SEED_FILE_PATH, logger });

  const earliestDeal = await new DealRepository(database.db).earliestDealDate();
  const priceIndexService = new PriceIndexService(
    new PriceIndexRepository(database.db),
    new CbsClient(new HttpClient(logger)),
    logger,
  );
  await priceIndexService.ensure(
    earliestDeal === null
      ? { year: new Date().getUTCFullYear() - 5, month: 1 }
      : { year: Number(earliestDeal.slice(0, 4)), month: Number(earliestDeal.slice(5, 7)) },
  );

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
