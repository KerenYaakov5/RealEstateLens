import { writeFile } from 'node:fs/promises';
import { LocalitiesClient, localitiesSourceLabel } from '../clients/dataGov/localitiesClient.js';
import { HttpClient } from '../clients/httpClient.js';
import { logger } from '../lib/logger.js';
import { DEFAULT_SNAPSHOT_PATH } from '../services/locality.service.js';

// `npm run localities:snapshot` – refreshes the committed fallback copy of the newest CBS
// localities file. The server reads the DB first, then the live API, and uses this copy only if
// both fail.
const client = new LocalitiesClient(new HttpClient(logger));
const file = await client.findLatestFile();
const localities = await client.fetchAll(file.resourceId);
localities.sort((a, b) => {
  return a.code - b.code;
});

const snapshot = {
  source: localitiesSourceLabel(file.year),
  resourceId: file.resourceId,
  year: file.year,
  sourceModifiedAt: file.lastModified,
  retrievedAt: new Date().toISOString().slice(0, 10),
  localities,
};
await writeFile(DEFAULT_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
logger.info({ count: localities.length, year: file.year }, 'Localities snapshot written');
