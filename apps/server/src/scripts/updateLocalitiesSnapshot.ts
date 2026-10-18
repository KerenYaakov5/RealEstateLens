import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CBS_LOCALITIES_RESOURCE_ID,
  CBS_LOCALITIES_SOURCE,
  LocalitiesClient,
} from '../clients/dataGov/localitiesClient.js';
import { HttpClient } from '../clients/httpClient.js';
import { logger } from '../lib/logger.js';

// `npm run localities:snapshot` – refreshes the committed fallback copy of the CBS localities
// file. The server reads the DB first, then the live API, and uses this file only if both fail.
const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/reference/cbs-localities-2023.json',
);

const localities = await new LocalitiesClient(new HttpClient(logger)).fetchAll();
localities.sort((a, b) => {
  return a.code - b.code;
});

const snapshot = {
  source: CBS_LOCALITIES_SOURCE,
  resourceId: CBS_LOCALITIES_RESOURCE_ID,
  retrievedAt: new Date().toISOString().slice(0, 10),
  localities,
};
await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
logger.info({ count: localities.length, target }, 'Localities snapshot written');
