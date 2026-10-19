import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CbsLocality, LocalitiesClient } from '../../src/clients/dataGov/localitiesClient.js';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { cities, cityAliases } from '../../src/db/schema.js';
import { logger } from '../../src/lib/logger.js';
import { CityRepository } from '../../src/repositories/city.repository.js';
import { LocalityService } from '../../src/services/locality.service.js';

const HOLON: CbsLocality = {
  code: 6600,
  nameHe: 'חולון',
  nameEn: 'Holon',
  coordinates: 179253658225,
  transliteration: 'HOLON',
  municipalStatus: 0,
  population: 192980,
};
const ROSH_PINNA: CbsLocality = {
  code: 26,
  nameHe: 'ראש פינה',
  nameEn: 'Rosh Pinna',
  coordinates: 252212763418,
  transliteration: 'ROSH PINNA',
  municipalStatus: 99,
  population: 3200,
};
const NO_COORDINATES: CbsLocality = {
  code: 1802,
  nameHe: 'יישוב בלי מיקום',
  nameEn: null,
  coordinates: null,
  transliteration: null,
  municipalStatus: null,
  population: null,
};
const OFFICIAL = [HOLON, ROSH_PINNA, NO_COORDINATES];

let handle: DatabaseHandle;
let repository: CityRepository;
let snapshotPath: string;

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

async function rowByCode(code: number) {
  const [row] = await handle.db.select().from(cities).where(eq(cities.cbsCode, code));
  return row;
}

beforeEach(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  repository = new CityRepository(handle.db);
  await repository.upsertReferenceCities(CITY_REFERENCES.filter((city) => city.key === 'holon'));
  const dir = await mkdtemp(path.join(tmpdir(), 'rel-snapshot-'));
  snapshotPath = path.join(dir, 'snapshot.json');
  await writeFile(
    snapshotPath,
    JSON.stringify({
      source: 'הלמ"ס – קובץ היישובים 2023',
      retrievedAt: '2026-10-18',
      localities: OFFICIAL,
    }),
  );
}, 60_000);

afterEach(async () => {
  await handle.close();
});

describe('LocalityService.ensureLocalities', () => {
  it('stores every official locality, keeping the reference city key and names', async () => {
    const { client } = fakeClient(async () => OFFICIAL);

    const outcome = await new LocalityService(
      repository,
      client,
      logger,
      snapshotPath,
    ).ensureLocalities();

    expect(outcome).toMatchObject({ status: 'loaded', origin: 'api', loaded: 3 });
    const holon = await rowByCode(6600);
    expect(holon).toMatchObject({ key: 'holon', itmX: 179253, itmY: 658225, population: 192980 });
    const roshPinna = await rowByCode(26);
    expect(roshPinna).toMatchObject({ key: 'cbs-26', nameHe: 'ראש פינה', municipalStatus: 99 });
  });

  it('turns official names and transliterations into search aliases', async () => {
    await new LocalityService(
      repository,
      fakeClient(async () => OFFICIAL).client,
      logger,
      snapshotPath,
    ).ensureLocalities();

    const roshPinna = await rowByCode(26);
    const aliases = await handle.db
      .select({ matchKey: cityAliases.matchKey })
      .from(cityAliases)
      .where(eq(cityAliases.cityId, roshPinna?.id ?? 0));

    expect(aliases.map((alias) => alias.matchKey).sort()).toEqual(['rosh pinna', 'ראש פינה']);
  });

  it('leaves a locality without official coordinates unknown – never guesses', async () => {
    const outcome = await new LocalityService(
      repository,
      fakeClient(async () => OFFICIAL).client,
      logger,
      snapshotPath,
    ).ensureLocalities();

    expect(outcome.withoutCoordinates).toBe(1);
    expect((await rowByCode(1802))?.itmX).toBeNull();
  });

  it('does not call the API when the DB already holds every locality', async () => {
    const holonOnly = [HOLON, ROSH_PINNA];
    await writeFile(
      snapshotPath,
      JSON.stringify({ source: 'x', retrievedAt: '2026-10-18', localities: holonOnly }),
    );
    await new LocalityService(
      repository,
      fakeClient(async () => holonOnly).client,
      logger,
      snapshotPath,
    ).ensureLocalities();

    const second = fakeClient(async () => holonOnly);
    const outcome = await new LocalityService(
      repository,
      second.client,
      logger,
      snapshotPath,
    ).ensureLocalities();

    expect(outcome.status).toBe('up-to-date');
    expect(second.calls()).toBe(0);
  });

  it('falls back to the committed snapshot when the API is down', async () => {
    const failing = fakeClient(async () => {
      throw new Error('data.gov.il down');
    });

    const outcome = await new LocalityService(
      repository,
      failing.client,
      logger,
      snapshotPath,
    ).ensureLocalities();

    expect(outcome.origin).toBe('snapshot');
    expect((await rowByCode(6600))?.coordinatesSource).toMatch(/עותק מ-2026-10-18/);
  });
});
