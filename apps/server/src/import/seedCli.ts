import { env } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { seedDeals } from './seedService.js';

// `npm run seed` – applies migrations and (re)imports the seed spreadsheet.
const handle = createDatabase({
  databaseUrl: env.DATABASE_URL,
  pgliteDataDir: env.PGLITE_DATA_DIR,
  logger,
});

try {
  await handle.migrate();
  await seedDeals({ db: handle.db, filePath: env.SEED_FILE_PATH, logger });
} catch (err) {
  logger.error({ err }, 'Seed failed');
  process.exitCode = 1;
} finally {
  await handle.close();
}
