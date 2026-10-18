import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CbsLocality, LocalitiesClient } from '../../src/clients/dataGov/localitiesClient.js';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { cities } from '../../src/db/schema.js';
import { logger } from '../../src/lib/logger.js';
import { CityRepository } from '../../src/repositories/city.repository.js';
import { LocalityService } from '../../src/services/locality.service.js';

const HOLON: CbsLocality = {
  code: 6600,
  nameHe: 'חולון',
  nameEn: 'Holon',
  coordinates: 179253658225,
};
const references = CITY_REFERENCES.filter((city) => city.key === 'holon' || city.key === 'haifa');

let handle: DatabaseHandle;
let repository: CityRepository;

function fakeClient(impl: () => Promise<CbsLocality[]>): {
  client: LocalitiesClient;
  calls: () => number;
} {
  const fetchAll = vi.fn(impl);
  return {
    client: { fetchAll } as unknown as LocalitiesClient,
    calls: () => fetchAll.mock.calls.length,
  };
}

async function holonRow() {
  const [row] = await handle.db.select().from(cities).where(eq(cities.key, 'holon'));
  return row;
}

beforeEach(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  repository = new CityRepository(handle.db);
  await repository.upsertReferenceCities(references);
}, 60_000);

afterEach(async () => {
  await handle.close();
});

describe('LocalityService.ensureCityCoordinates', () => {
  it('loads coordinates from the API and records the source', async () => {
    const { client } = fakeClient(async () => [HOLON]);

    const outcome = await new LocalityService(repository, client, logger).ensureCityCoordinates();

    expect(outcome).toMatchObject({ status: 'loaded', origin: 'api', updated: ['holon'] });
    const row = await holonRow();
    expect([row?.itmX, row?.itmY]).toEqual([179253, 658225]);
    expect(row?.coordinatesSource).toMatch(/הלמ"ס/);
  });

  it('leaves a city without official coordinates unknown – never guesses', async () => {
    const { client } = fakeClient(async () => [
      HOLON,
      { code: 4000, nameHe: 'חיפה', nameEn: 'Haifa', coordinates: null },
    ]);

    const outcome = await new LocalityService(repository, client, logger).ensureCityCoordinates();

    expect(outcome.unresolved).toEqual(['haifa']);
    const [haifa] = await handle.db.select().from(cities).where(eq(cities.key, 'haifa'));
    expect(haifa?.itmX).toBeNull();
  });

  it('does not call the API when the DB already has the coordinates', async () => {
    await new LocalityService(
      repository,
      fakeClient(async () => [HOLON, { ...HOLON, code: 4000, coordinates: 201177745467 }]).client,
      logger,
    ).ensureCityCoordinates();

    const second = fakeClient(async () => [HOLON]);
    const outcome = await new LocalityService(
      repository,
      second.client,
      logger,
    ).ensureCityCoordinates();

    expect(outcome.status).toBe('up-to-date');
    expect(second.calls()).toBe(0);
  });

  it('falls back to the committed snapshot when the API is down', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rel-snapshot-'));
    const snapshotPath = path.join(dir, 'snapshot.json');
    await writeFile(
      snapshotPath,
      JSON.stringify({
        source: 'הלמ"ס – קובץ היישובים 2023',
        retrievedAt: '2026-10-18',
        localities: [HOLON],
      }),
    );
    const failing = fakeClient(async () => {
      throw new Error('data.gov.il down');
    });

    const outcome = await new LocalityService(
      repository,
      failing.client,
      logger,
      snapshotPath,
    ).ensureCityCoordinates();

    expect(outcome.origin).toBe('snapshot');
    const row = await holonRow();
    expect(row?.itmX).toBe(179253);
    expect(row?.coordinatesSource).toMatch(/עותק מ-2026-10-18/);
  });
});
