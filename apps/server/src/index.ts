import { createApp } from './app.js';
import { CbsClient } from './clients/cbs/cbsClient.js';
import { LocalitiesClient } from './clients/dataGov/localitiesClient.js';
import { HttpClient } from './clients/httpClient.js';
import { env } from './config/env.js';
import { CITY_REFERENCES } from './data/cities.js';
import { createDatabase } from './db/client.js';
import { ensureSeeded } from './import/seedService.js';
import { logger } from './lib/logger.js';
import { CityRepository } from './repositories/city.repository.js';
import { DealRepository } from './repositories/deal.repository.js';
import { NeighborhoodRepository } from './repositories/neighborhood.repository.js';
import { PriceIndexRepository } from './repositories/priceIndex.repository.js';
import { ReferenceSourceRepository } from './repositories/referenceSource.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { AuthService } from './services/auth.service.js';
import { LocalityService } from './services/locality.service.js';
import { MarketDataService } from './services/marketData.service.js';
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

  // Reference data changes with the code (e.g. new aliases or CBS codes), not only with a seed,
  // so it is refreshed on every start. Idempotent upsert of a few rows.
  const cityRepository = new CityRepository(database.db);
  await cityRepository.upsertReferenceCities(CITY_REFERENCES);

  const httpClient = new HttpClient(logger);
  await new LocalityService(
    cityRepository,
    new ReferenceSourceRepository(database.db),
    new LocalitiesClient(httpClient),
    logger,
    { checkIntervalMonths: env.LOCALITIES_CHECK_MONTHS },
  ).ensureLocalities();

  const earliestDeal = await new DealRepository(database.db).earliestDealDate();
  const priceIndexService = new PriceIndexService(
    new PriceIndexRepository(database.db),
    new CbsClient(httpClient),
    logger,
  );
  await priceIndexService.ensure(
    earliestDeal === null
      ? { year: new Date().getUTCFullYear() - 5, month: 1 }
      : { year: Number(earliestDeal.slice(0, 4)), month: Number(earliestDeal.slice(5, 7)) },
  );

  // Load the market into memory before accepting traffic, so the first request is fast.
  const marketData = new MarketDataService(
    {
      deals: new DealRepository(database.db),
      cities: cityRepository,
      neighborhoods: new NeighborhoodRepository(database.db),
      priceIndex: new PriceIndexRepository(database.db),
    },
    logger,
  );
  await marketData.getMarket();

  const isProduction = env.NODE_ENV === 'production';
  const app = createApp({
    auth: new AuthService(new UserRepository(database.db), env.JWT_SECRET, env.SESSION_TTL_HOURS),
    marketData,
    options: {
      secureCookies: isProduction,
      trustProxy: isProduction,
      rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
      loginMaxAttempts: env.LOGIN_MAX_ATTEMPTS,
      loginWindowMinutes: env.LOGIN_WINDOW_MINUTES,
    },
  });
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
