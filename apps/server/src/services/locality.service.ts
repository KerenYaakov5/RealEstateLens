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
import type { CityRepository } from '../repositories/city.repository.js';
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
    }),
  ),
});

export interface CoordinatesOutcome {
  status: 'up-to-date' | 'loaded';
  /** Where the coordinates came from: the live API or the committed snapshot. */
  origin?: 'api' | 'snapshot';
  updated: string[];
  /** Cities whose official record has no usable coordinates – they are left unknown. */
  unresolved: string[];
}

/**
 * Loads official city coordinates. Order: DB → data.gov.il API → committed snapshot of the
 * same CBS file. Nothing is ever estimated: a city without official coordinates stays
 * without them (and is then never offered as a "nearby city").
 */
export class LocalityService {
  constructor(
    private readonly cities: CityRepository,
    private readonly client: LocalitiesClient,
    private readonly logger: Logger,
    private readonly snapshotPath: string = DEFAULT_SNAPSHOT_PATH,
  ) {}

  async ensureCityCoordinates(): Promise<CoordinatesOutcome> {
    const missing = await this.cities.findMissingCoordinates();
    if (missing.length === 0) {
      return { status: 'up-to-date', updated: [], unresolved: [] };
    }

    const { localities, origin, source } = await this.loadLocalities();
    const byCode = new Map(
      localities.map((locality) => {
        return [locality.code, locality] as const;
      }),
    );

    const updated: string[] = [];
    const unresolved: string[] = [];
    for (const city of missing) {
      const point = parseCbsCoordinates(byCode.get(city.cbsCode)?.coordinates);
      if (point === null) {
        unresolved.push(city.key);
        continue;
      }
      await this.cities.setCoordinates(city.id, point, source);
      updated.push(city.key);
    }

    if (unresolved.length > 0) {
      this.logger.warn({ unresolved }, 'No official coordinates for some cities – left unknown');
    }
    this.logger.info({ origin, updated: updated.length }, 'City coordinates loaded');
    return { status: 'loaded', origin, updated, unresolved };
  }

  private async loadLocalities(): Promise<{
    localities: CbsLocality[];
    origin: 'api' | 'snapshot';
    source: string;
  }> {
    try {
      const localities = await this.client.fetchAll();
      return { localities, origin: 'api', source: CBS_LOCALITIES_SOURCE };
    } catch (err) {
      this.logger.warn({ err }, 'Localities API unavailable – using the committed snapshot');
      const snapshot = snapshotSchema.parse(
        JSON.parse(await readFile(this.snapshotPath, 'utf8')) as unknown,
      );
      return {
        localities: snapshot.localities,
        origin: 'snapshot',
        source: `${snapshot.source}, עותק מ-${snapshot.retrievedAt}`,
      };
    }
  }
}
