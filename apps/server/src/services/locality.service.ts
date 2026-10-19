import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CBS_LOCALITIES_RESOURCE_ID,
  localitiesSourceLabel,
  type CbsLocality,
  type LocalitiesClient,
  type LocalitiesFile,
} from '../clients/dataGov/localitiesClient.js';
import type { Logger } from '../lib/logger.js';
import type { CityRepository, OfficialLocality } from '../repositories/city.repository.js';
import type {
  ReferenceSourceRepository,
  ReferenceSourceState,
} from '../repositories/referenceSource.repository.js';
import { parseCbsCoordinates } from './geo/itm.js';

export const DEFAULT_SNAPSHOT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/reference/cbs-localities.json',
);
export const LOCALITIES_SOURCE_KEY = 'cbs-localities';

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
type RawLocality = CbsLocality | Snapshot['localities'][number];

export type LocalitiesStatus =
  /** First load into an empty / incomplete DB. */
  | 'loaded'
  /** Checked recently – nothing to do. */
  | 'up-to-date'
  /** Periodic check: the published file has not changed. */
  | 'unchanged'
  /** Periodic check: a newer or modified file was found and loaded. */
  | 'reloaded'
  /** Periodic check could not reach the source; existing data kept, retried on next start. */
  | 'check-failed';

export interface LocalitiesOutcome {
  status: LocalitiesStatus;
  origin?: 'api' | 'snapshot';
  loaded: number;
  /** Localities whose official record has no usable coordinates – left unknown. */
  withoutCoordinates: number;
  year?: number;
}

export interface LocalityServiceOptions {
  snapshotPath?: string;
  /** Minimum time between checks for a newer published file. */
  checkIntervalMonths?: number;
  now?: () => Date;
}

/**
 * Keeps every official locality (CBS localities file) in the DB. Order: DB → data.gov.il API →
 * committed snapshot. CBS publishes a new file every year, so at most every
 * `checkIntervalMonths` (on startup) one metadata request checks for a newer or modified file and
 * reloads only if something changed. Nothing is estimated: a locality without official
 * coordinates stays without them.
 */
export class LocalityService {
  private readonly snapshotPath: string;
  private readonly checkIntervalMonths: number;
  private readonly now: () => Date;

  constructor(
    private readonly cities: CityRepository,
    private readonly sources: ReferenceSourceRepository,
    private readonly client: LocalitiesClient,
    private readonly logger: Logger,
    options: LocalityServiceOptions = {},
  ) {
    this.snapshotPath = options.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;
    this.checkIntervalMonths = options.checkIntervalMonths ?? 6;
    this.now =
      options.now ??
      (() => {
        return new Date();
      });
  }

  async ensureLocalities(): Promise<LocalitiesOutcome> {
    const [stored, notYetLoaded, snapshot, state] = await Promise.all([
      this.cities.countLocalities(),
      this.cities.findNotYetLoaded(),
      this.readSnapshot(),
      this.sources.get(LOCALITIES_SOURCE_KEY),
    ]);
    // Complete = at least as many localities as the official snapshot, none never loaded.
    const complete = stored >= snapshot.localities.length && notYetLoaded.length === 0;
    if (!complete) {
      return this.initialLoad(snapshot);
    }
    if (state !== undefined && !this.isCheckDue(state)) {
      return { status: 'up-to-date', loaded: 0, withoutCoordinates: 0 };
    }
    return this.checkForNewerFile(state);
  }

  private isCheckDue(state: ReferenceSourceState): boolean {
    const due = new Date(state.checkedAt);
    due.setUTCMonth(due.getUTCMonth() + this.checkIntervalMonths);
    return this.now().getTime() >= due.getTime();
  }

  private async initialLoad(snapshot: Snapshot): Promise<LocalitiesOutcome> {
    try {
      const file = await this.latestFileOrDefault();
      const localities = await this.client.fetchAll(file.resourceId);
      const outcome = await this.store(localities, localitiesSourceLabel(file.year));
      await this.sources.recordLoad(LOCALITIES_SOURCE_KEY, file.resourceId, file.lastModified);
      return { ...outcome, status: 'loaded', origin: 'api', year: file.year };
    } catch (err) {
      this.logger.warn({ err }, 'Localities API unavailable – using the committed snapshot');
      const outcome = await this.store(
        snapshot.localities,
        `${snapshot.source}, עותק מ-${snapshot.retrievedAt}`,
      );
      // Not recorded as checked, so the next start checks the API again.
      return { ...outcome, status: 'loaded', origin: 'snapshot' };
    }
  }

  private async checkForNewerFile(
    state: ReferenceSourceState | undefined,
  ): Promise<LocalitiesOutcome> {
    let latest: LocalitiesFile;
    try {
      latest = await this.client.findLatestFile();
    } catch (err) {
      this.logger.warn(
        { err },
        'Localities check failed – keeping stored data, retry on next start',
      );
      return { status: 'check-failed', loaded: 0, withoutCoordinates: 0 };
    }
    const unchanged =
      state !== undefined &&
      state.resourceId === latest.resourceId &&
      state.sourceModifiedAt === latest.lastModified;
    if (unchanged) {
      await this.sources.recordCheck(LOCALITIES_SOURCE_KEY);
      this.logger.info({ year: latest.year }, 'Localities file unchanged');
      return { status: 'unchanged', loaded: 0, withoutCoordinates: 0, year: latest.year };
    }
    try {
      const localities = await this.client.fetchAll(latest.resourceId);
      const outcome = await this.store(localities, localitiesSourceLabel(latest.year));
      await this.sources.recordLoad(LOCALITIES_SOURCE_KEY, latest.resourceId, latest.lastModified);
      this.logger.info(
        { year: latest.year, loaded: outcome.loaded },
        'Newer localities file loaded',
      );
      return { ...outcome, status: 'reloaded', origin: 'api', year: latest.year };
    } catch (err) {
      this.logger.warn(
        { err, year: latest.year },
        'Reloading localities failed – keeping stored data',
      );
      return { status: 'check-failed', loaded: 0, withoutCoordinates: 0 };
    }
  }

  /** The newest file per the dataset metadata; the known 2023 file if metadata is unavailable. */
  private async latestFileOrDefault(): Promise<LocalitiesFile> {
    try {
      return await this.client.findLatestFile();
    } catch (err) {
      this.logger.warn({ err }, 'Localities metadata unavailable – using the 2023 file');
      return { resourceId: CBS_LOCALITIES_RESOURCE_ID, year: 2023, lastModified: null };
    }
  }

  private async store(
    localities: readonly RawLocality[],
    source: string,
  ): Promise<Pick<LocalitiesOutcome, 'loaded' | 'withoutCoordinates'>> {
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
    this.logger.info({ loaded: official.length, withoutCoordinates, source }, 'Localities stored');
    return { loaded: official.length, withoutCoordinates };
  }

  private async readSnapshot(): Promise<Snapshot> {
    return snapshotSchema.parse(JSON.parse(await readFile(this.snapshotPath, 'utf8')) as unknown);
  }
}
