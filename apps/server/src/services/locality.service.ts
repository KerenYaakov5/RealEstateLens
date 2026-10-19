import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CBS_LOCALITIES_SOURCE,
  type CbsLocality,
  type LocalitiesClient,
} from '../clients/dataGov/localitiesClient.js';
import type { Logger } from '../lib/logger.js';
import type { CityRepository, OfficialLocality } from '../repositories/city.repository.js';
import { parseCbsCoordinates } from './geo/itm.js';

export const DEFAULT_SNAPSHOT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/reference/cbs-localities-2023.json',
);

const snapshotSchema = z.object({
  source: z.string(),
  retrievedAt: z.string(),
  localities: z.array(
    z.object({
      code: z.number().int(),
      nameHe: z.string(),
      nameEn: z.string().nullable(),
      coordinates: z.number().nullable(),
      transliteration: z.string().nullable().optional(),
      municipalStatus: z.number().nullable().optional(),
      population: z.number().nullable().optional(),
    }),
  ),
});

type Snapshot = z.infer<typeof snapshotSchema>;

export interface LocalitiesOutcome {
  status: 'up-to-date' | 'loaded';
  /** Where the data came from: the live API or the committed snapshot. */
  origin?: 'api' | 'snapshot';
  loaded: number;
  /** Localities whose official record has no usable coordinates – left unknown. */
  withoutCoordinates: number;
}

/**
 * Keeps every official locality (CBS localities file) in the DB: names, English names,
 * transliterations, population, municipal status and coordinates. Order: DB → data.gov.il API
 * → committed snapshot of the same file. Nothing is estimated: a locality without official
 * coordinates stays without them (and is then never offered as a "nearby city").
 */
export class LocalityService {
  constructor(
    private readonly cities: CityRepository,
    private readonly client: LocalitiesClient,
    private readonly logger: Logger,
    private readonly snapshotPath: string = DEFAULT_SNAPSHOT_PATH,
  ) {}

  async ensureLocalities(): Promise<LocalitiesOutcome> {
    const [stored, missingCoordinates, snapshot] = await Promise.all([
      this.cities.countLocalities(),
      this.cities.findMissingCoordinates(),
      this.readSnapshot(),
    ]);
    // The DB is complete when it holds at least as many localities as the official snapshot
    // and none of them is still waiting for coordinates that the file can provide.
    const complete = stored >= snapshot.localities.length && missingCoordinates.length === 0;
    if (complete) {
      return { status: 'up-to-date', loaded: 0, withoutCoordinates: 0 };
    }

    const { localities, origin, source } = await this.load(snapshot);
    const official = localities.map((locality): OfficialLocality => {
      return {
        code: locality.code,
        nameHe: locality.nameHe,
        nameEn: locality.nameEn,
        transliteration: locality.transliteration ?? null,
        municipalStatus: locality.municipalStatus ?? null,
        population: locality.population ?? null,
        location: parseCbsCoordinates(locality.coordinates),
      };
    });
    await this.cities.upsertLocalities(official, source);

    const withoutCoordinates = official.filter((locality) => {
      return locality.location === null;
    }).length;
    this.logger.info(
      { origin, loaded: official.length, withoutCoordinates },
      'Official localities loaded',
    );
    return { status: 'loaded', origin, loaded: official.length, withoutCoordinates };
  }

  private async readSnapshot(): Promise<Snapshot> {
    return snapshotSchema.parse(JSON.parse(await readFile(this.snapshotPath, 'utf8')) as unknown);
  }

  private async load(snapshot: Snapshot): Promise<{
    localities: (CbsLocality | Snapshot['localities'][number])[];
    origin: 'api' | 'snapshot';
    source: string;
  }> {
    try {
      const localities = await this.client.fetchAll();
      return { localities, origin: 'api', source: CBS_LOCALITIES_SOURCE };
    } catch (err) {
      this.logger.warn({ err }, 'Localities API unavailable – using the committed snapshot');
      return {
        localities: snapshot.localities,
        origin: 'snapshot',
        source: `${snapshot.source}, עותק מ-${snapshot.retrievedAt}`,
      };
    }
  }
}
