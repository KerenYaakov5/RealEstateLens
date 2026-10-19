import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CbsLocality,
  LocalitiesClient,
  LocalitiesFile,
} from '../../src/clients/dataGov/localitiesClient.js';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { cities, cityAliases, referenceSources } from '../../src/db/schema.js';
import { logger } from '../../src/lib/logger.js';
import { CityRepository } from '../../src/repositories/city.repository.js';
import { ReferenceSourceRepository } from '../../src/repositories/referenceSource.repository.js';
import {
  LOCALITIES_SOURCE_KEY,
  LocalityService,
  type LocalityServiceOptions,
} from '../../src/services/locality.service.js';

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
const FILE_2023: LocalitiesFile = {
  resourceId: 'res-2023',
  year: 2023,
  lastModified: '2025-04-08',
};
const FILE_2024: LocalitiesFile = {
  resourceId: 'res-2024',
  year: 2024,
  lastModified: '2026-03-01',
};

let handle: DatabaseHandle;
let cityRepository: CityRepository;
let sources: ReferenceSourceRepository;
let snapshotPath: string;

interface FakeClient {
  client: LocalitiesClient;
  fetchAll: ReturnType<typeof vi.fn>;
  findLatestFile: ReturnType<typeof vi.fn>;
}

function fakeClient(
  file: LocalitiesFile | Error = FILE_2023,
  localities: CbsLocality[] | Error = OFFICIAL,
): FakeClient {
  const findLatestFile = vi.fn(async () => {
    if (file instanceof Error) {
      throw file;
    }
    return file;
  });
  const fetchAll = vi.fn(async () => {
    if (localities instanceof Error) {
      throw localities;
    }
    return localities;
  });
  return {
    client: { findLatestFile, fetchAll } as unknown as LocalitiesClient,
    fetchAll,
    findLatestFile,
  };
}

function service(fake: FakeClient, options: LocalityServiceOptions = {}): LocalityService {
  return new LocalityService(cityRepository, sources, fake.client, logger, {
    snapshotPath,
    ...options,
  });
}

async function rowByCode(code: number) {
  const [row] = await handle.db.select().from(cities).where(eq(cities.cbsCode, code));
  return row;
}

async function setCheckedAt(date: Date): Promise<void> {
  await handle.db
    .update(referenceSources)
    .set({ checkedAt: date })
    .where(eq(referenceSources.key, LOCALITIES_SOURCE_KEY));
}

const inSevenMonths = () => new Date(Date.now() + 7 * 31 * 86_400_000);

beforeEach(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  cityRepository = new CityRepository(handle.db);
  sources = new ReferenceSourceRepository(handle.db);
  await cityRepository.upsertReferenceCities(
    CITY_REFERENCES.filter((city) => city.key === 'holon'),
  );
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

describe('first load', () => {
  it('stores every locality from the newest file and records which file it was', async () => {
    const fake = fakeClient();

    const outcome = await service(fake).ensureLocalities();

    expect(outcome).toMatchObject({ status: 'loaded', origin: 'api', loaded: 3, year: 2023 });
    expect(fake.fetchAll).toHaveBeenCalledWith('res-2023');
    expect(await rowByCode(6600)).toMatchObject({ key: 'holon', itmX: 179253, population: 192980 });
    expect(await rowByCode(26)).toMatchObject({ key: 'cbs-26', municipalStatus: 99 });
    expect(await sources.get(LOCALITIES_SOURCE_KEY)).toMatchObject({
      resourceId: 'res-2023',
      sourceModifiedAt: '2025-04-08',
    });
  });

  it('turns official names and transliterations into search aliases', async () => {
    await service(fakeClient()).ensureLocalities();

    const roshPinna = await rowByCode(26);
    const aliases = await handle.db
      .select({ matchKey: cityAliases.matchKey })
      .from(cityAliases)
      .where(eq(cityAliases.cityId, roshPinna?.id ?? 0));

    expect(aliases.map((alias) => alias.matchKey).sort()).toEqual(['rosh pinna', 'ראש פינה']);
  });

  it('leaves a locality without official coordinates unknown – never guesses', async () => {
    const outcome = await service(fakeClient()).ensureLocalities();

    expect(outcome.withoutCoordinates).toBe(1);
    expect((await rowByCode(1802))?.itmX).toBeNull();
  });

  it('falls back to the committed snapshot when the API is down, without marking a check', async () => {
    const outcome = await service(
      fakeClient(new Error('down'), new Error('down')),
    ).ensureLocalities();

    expect(outcome).toMatchObject({ status: 'loaded', origin: 'snapshot' });
    expect((await rowByCode(6600))?.coordinatesSource).toMatch(/עותק מ-2026-10-18/);
    expect(await sources.get(LOCALITIES_SOURCE_KEY)).toBeUndefined();
  });
});

describe('periodic check for a newer file', () => {
  beforeEach(async () => {
    await service(fakeClient()).ensureLocalities();
  });

  it('does nothing before the interval has passed – not even a metadata request', async () => {
    const fake = fakeClient();

    const outcome = await service(fake).ensureLocalities();

    expect(outcome.status).toBe('up-to-date');
    expect(fake.findLatestFile).not.toHaveBeenCalled();
    expect(fake.fetchAll).not.toHaveBeenCalled();
  });

  it('after the interval, only records the check when the file is unchanged', async () => {
    const fake = fakeClient(FILE_2023);

    const outcome = await service(fake, { now: inSevenMonths }).ensureLocalities();

    expect(outcome.status).toBe('unchanged');
    expect(fake.findLatestFile).toHaveBeenCalledOnce();
    expect(fake.fetchAll).not.toHaveBeenCalled();
  });

  it('honours a custom interval', async () => {
    await setCheckedAt(new Date(Date.now() - 40 * 86_400_000));
    const fake = fakeClient(FILE_2023);

    expect((await service(fake, { checkIntervalMonths: 1 }).ensureLocalities()).status).toBe(
      'unchanged',
    );
  });

  it('reloads from a newer yearly file and updates official names (not reference cities)', async () => {
    const renamed = { ...ROSH_PINNA, nameHe: 'ראש פינה (חדש)', population: 3300 };
    const holonRenamed = { ...HOLON, nameHe: 'חולון בשם אחר' };
    const fake = fakeClient(FILE_2024, [holonRenamed, renamed, NO_COORDINATES]);

    const outcome = await service(fake, { now: inSevenMonths }).ensureLocalities();

    expect(outcome).toMatchObject({ status: 'reloaded', year: 2024 });
    expect(fake.fetchAll).toHaveBeenCalledWith('res-2024');
    expect(await rowByCode(26)).toMatchObject({ nameHe: 'ראש פינה (חדש)', population: 3300 });
    expect((await rowByCode(6600))?.nameHe).toBe('חולון');
    expect(await sources.get(LOCALITIES_SOURCE_KEY)).toMatchObject({ resourceId: 'res-2024' });
  });

  it('reloads when the same file was modified', async () => {
    const fake = fakeClient({ ...FILE_2023, lastModified: '2026-01-01' });

    expect((await service(fake, { now: inSevenMonths }).ensureLocalities()).status).toBe(
      'reloaded',
    );
  });

  it('keeps the data and retries next start when the check fails', async () => {
    const before = await sources.get(LOCALITIES_SOURCE_KEY);

    const outcome = await service(fakeClient(new Error('down')), {
      now: inSevenMonths,
    }).ensureLocalities();

    expect(outcome.status).toBe('check-failed');
    expect((await sources.get(LOCALITIES_SOURCE_KEY))?.checkedAt).toEqual(before?.checkedAt);
    expect(await rowByCode(26)).toBeDefined();
  });
});
