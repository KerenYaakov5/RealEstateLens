import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import request from 'supertest';
import { createApp, type AppOptions } from '../../src/app.js';
import type { LocalitiesClient } from '../../src/clients/dataGov/localitiesClient.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { seedDeals } from '../../src/import/seedService.js';
import { logger } from '../../src/lib/logger.js';
import { CityRepository } from '../../src/repositories/city.repository.js';
import { DealRepository } from '../../src/repositories/deal.repository.js';
import { NeighborhoodRepository } from '../../src/repositories/neighborhood.repository.js';
import { PriceIndexRepository } from '../../src/repositories/priceIndex.repository.js';
import { ReferenceSourceRepository } from '../../src/repositories/referenceSource.repository.js';
import { UserRepository } from '../../src/repositories/user.repository.js';
import { AuthService, hashPassword } from '../../src/services/auth.service.js';
import { LocalityService } from '../../src/services/locality.service.js';
import { MarketDataService } from '../../src/services/marketData.service.js';

export const TEST_USER = { email: 'tester@example.com', password: 'correct-horse-battery' };
const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';
const SEED_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/madlan-sample.xlsx',
);
const offline = () => Promise.reject(new Error('offline in tests'));
const offlineLocalities = {
  fetchAll: offline,
  findLatestFile: offline,
} as unknown as LocalitiesClient;

export interface TestApp {
  app: Express;
  handle: DatabaseHandle;
  users: UserRepository;
  close(): Promise<void>;
}

export interface TestAppSetup {
  options?: Partial<AppOptions>;
  /** Import the real seed file (and official coordinates from the committed snapshot). */
  withSeedData?: boolean;
}

/** An app on a fresh in-memory database with one active test user. */
export async function createTestApp(setup: TestAppSetup = {}): Promise<TestApp> {
  const handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  const users = new UserRepository(handle.db);
  await users.create(TEST_USER.email, await hashPassword(TEST_USER.password));

  const cities = new CityRepository(handle.db);
  if (setup.withSeedData === true) {
    await seedDeals({ db: handle.db, filePath: SEED_FILE, logger, today: new Date('2026-10-18') });
    await new LocalityService(
      cities,
      new ReferenceSourceRepository(handle.db),
      offlineLocalities,
      logger,
    ).ensureLocalities();
  }
  const marketData = new MarketDataService(
    {
      deals: new DealRepository(handle.db),
      cities,
      neighborhoods: new NeighborhoodRepository(handle.db),
      priceIndex: new PriceIndexRepository(handle.db),
    },
    logger,
  );

  const app = createApp({
    auth: new AuthService(users, TEST_SECRET, 24),
    marketData,
    options: {
      secureCookies: false,
      trustProxy: false,
      rateLimitPerMinute: 1000,
      loginMaxAttempts: 5,
      loginWindowMinutes: 15,
      ...setup.options,
    },
  });
  return { app, handle, users, close: () => handle.close() };
}

/** Logs in and returns the session cookie header value. */
export async function loginCookie(app: Express): Promise<string> {
  const res = await request(app).post('/api/v1/sessions').send(TEST_USER);
  const cookie = res.headers['set-cookie']?.[0];
  if (res.status !== 201 || cookie === undefined) {
    throw new Error(`login failed with ${res.status}`);
  }
  return cookie.split(';')[0] ?? '';
}
