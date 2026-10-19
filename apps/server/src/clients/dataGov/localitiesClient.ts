import { z } from 'zod';
import type { HttpClient } from '../httpClient.js';

/**
 * CBS localities files ("קובץ היישובים YYYY"), published on data.gov.il – a new file every year
 * in the same dataset. Dataset: https://data.gov.il/dataset/localities-in-israel
 * Read through the CKAN API (the direct file download is blocked by the CDN).
 */
export const CBS_LOCALITIES_DATASET = 'localities-in-israel';
/** The 2023 file – used until a check finds a newer one. */
export const CBS_LOCALITIES_RESOURCE_ID = 'd47a54ff-87f0-44b3-b33a-f284c0c38e5a';

export function localitiesSourceLabel(year: number | null): string {
  return `הלמ"ס – קובץ היישובים${year === null ? '' : ` ${year}`} (data.gov.il)`;
}
/** Label of the default (2023) file. */
export const CBS_LOCALITIES_SOURCE = localitiesSourceLabel(2023);

const API = 'https://data.gov.il/api/3/action';
// data.gov.il rejects requests without a User-Agent.
const HEADERS = {
  'user-agent': 'RealEstateLens/0.1 (+https://github.com/KerenYaakov5/RealEstateLens)',
};

const FIELD_CODE = 'סמל יישוב';
const FIELD_NAME_HE = 'שם יישוב';
const FIELD_NAME_EN = 'שם יישוב באנגלית';
const FIELD_COORDINATES = 'קואורדינטות';
const FIELD_TRANSLITERATION = 'תעתיק';
const FIELD_MUNICIPAL_STATUS = 'סמל מעמד מונציפאלי';
/** The population column carries the year in its name ("… 2023 - ארעי", "… 2022"). */
const POPULATION_FIELD_PREFIX = 'סך הכל אוכלוסייה';
const REQUIRED_FIELDS = [FIELD_CODE, FIELD_NAME_HE, FIELD_COORDINATES] as const;

const LOCALITIES_FILE_NAME = /קובץ היישובים\s+(\d{4})/;

const packageSchema = z.object({
  success: z.literal(true),
  result: z.object({
    resources: z.array(
      z.object({
        id: z.string(),
        name: z.string().nullable().optional(),
        last_modified: z.string().nullable().optional(),
        datastore_active: z.boolean().nullable().optional(),
      }),
    ),
  }),
});

const fieldsSchema = z.object({
  success: z.literal(true),
  result: z.object({ total: z.number().int(), fields: z.array(z.object({ id: z.string() })) }),
});

const recordsSchema = z.object({
  success: z.literal(true),
  result: z.object({
    total: z.number().int(),
    records: z.array(z.record(z.string(), z.unknown())),
  }),
});

export interface CbsLocality {
  code: number;
  nameHe: string;
  nameEn: string | null;
  /** Raw value of the "קואורדינטות" column; parse with parseCbsCoordinates. */
  coordinates: number | null;
  /** Official Latin transliteration (present even when the English name is missing). */
  transliteration: string | null;
  /** CBS municipal status code: 0 = city (עירייה), 99 = local council, others = regional/none. */
  municipalStatus: number | null;
  population: number | null;
}

export interface LocalitiesFile {
  resourceId: string;
  year: number;
  /** As published by data.gov.il; compared verbatim to detect changes. */
  lastModified: string | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class LocalitiesClient {
  constructor(private readonly http: HttpClient) {}

  /** The newest yearly localities file in the dataset (one small metadata request). */
  async findLatestFile(): Promise<LocalitiesFile> {
    const body = await this.http.getJson(
      `${API}/package_show?${new URLSearchParams({ id: CBS_LOCALITIES_DATASET }).toString()}`,
      { schema: packageSchema, timeoutMs: 15_000, headers: HEADERS },
    );
    const files = body.result.resources.flatMap((resource): LocalitiesFile[] => {
      const year = LOCALITIES_FILE_NAME.exec(resource.name ?? '')?.[1];
      if (year === undefined || resource.datastore_active !== true) {
        return [];
      }
      return [
        {
          resourceId: resource.id,
          year: Number(year),
          lastModified: resource.last_modified ?? null,
        },
      ];
    });
    const latest = files.sort((a, b) => {
      return b.year - a.year;
    })[0];
    if (latest === undefined) {
      throw new Error('No localities file found in the data.gov.il dataset');
    }
    return latest;
  }

  /** Every locality in one yearly file. Fails rather than returning a partial list. */
  async fetchAll(resourceId: string = CBS_LOCALITIES_RESOURCE_ID): Promise<CbsLocality[]> {
    const fields = await this.http.getJson(
      `${API}/datastore_search?${new URLSearchParams({ resource_id: resourceId, limit: '0' }).toString()}`,
      { schema: fieldsSchema, timeoutMs: 15_000, headers: HEADERS },
    );
    const available = fields.result.fields.map((field) => {
      return field.id;
    });
    const missing = REQUIRED_FIELDS.filter((field) => {
      return !available.includes(field);
    });
    if (missing.length > 0) {
      throw new Error(`Localities file ${resourceId} lacks fields: ${missing.join(', ')}`);
    }
    const populationField = available.find((field) => {
      return field.startsWith(POPULATION_FIELD_PREFIX);
    });
    const wanted = [
      FIELD_CODE,
      FIELD_NAME_HE,
      FIELD_NAME_EN,
      FIELD_COORDINATES,
      FIELD_TRANSLITERATION,
      FIELD_MUNICIPAL_STATUS,
      ...(populationField === undefined ? [] : [populationField]),
    ].filter((field) => {
      return available.includes(field);
    });

    const params = new URLSearchParams({
      resource_id: resourceId,
      limit: String(Math.max(fields.result.total, 1)),
      fields: wanted.join(','),
    });
    const body = await this.http.getJson(`${API}/datastore_search?${params.toString()}`, {
      schema: recordsSchema,
      timeoutMs: 20_000,
      headers: HEADERS,
    });
    if (body.result.records.length < body.result.total) {
      // Never store a partial list of localities.
      throw new Error(
        `Localities API returned ${body.result.records.length} of ${body.result.total} records`,
      );
    }
    return body.result.records.flatMap((record): CbsLocality[] => {
      const code = numberOrNull(record[FIELD_CODE]);
      const nameHe = textOrNull(record[FIELD_NAME_HE]);
      if (code === null || nameHe === null) {
        return [];
      }
      return [
        {
          code,
          nameHe,
          nameEn: textOrNull(record[FIELD_NAME_EN]),
          coordinates: numberOrNull(record[FIELD_COORDINATES]),
          transliteration: textOrNull(record[FIELD_TRANSLITERATION]),
          municipalStatus: numberOrNull(record[FIELD_MUNICIPAL_STATUS]),
          population: populationField === undefined ? null : numberOrNull(record[populationField]),
        },
      ];
    });
  }
}
