import { z } from 'zod';
import type { HttpClient } from '../httpClient.js';

/**
 * CBS localities file ("קובץ היישובים 2023"), published on data.gov.il.
 * Dataset: https://data.gov.il/dataset/localities-in-israel
 * Read through the CKAN datastore API (the direct file download is blocked by the CDN).
 */
export const CBS_LOCALITIES_RESOURCE_ID = 'd47a54ff-87f0-44b3-b33a-f284c0c38e5a';
export const CBS_LOCALITIES_SOURCE = 'הלמ"ס – קובץ היישובים 2023 (data.gov.il)';

const DATASTORE_URL = 'https://data.gov.il/api/3/action/datastore_search';

const FIELD_CODE = 'סמל יישוב';
const FIELD_NAME_HE = 'שם יישוב';
const FIELD_NAME_EN = 'שם יישוב באנגלית';
const FIELD_COORDINATES = 'קואורדינטות';

const recordSchema = z.object({
  [FIELD_CODE]: z.number().int(),
  [FIELD_NAME_HE]: z.string(),
  [FIELD_NAME_EN]: z.string().nullable().optional(),
  [FIELD_COORDINATES]: z.number().nullable().optional(),
});

const responseSchema = z.object({
  success: z.literal(true),
  result: z.object({ total: z.number().int(), records: z.array(recordSchema) }),
});

export interface CbsLocality {
  code: number;
  nameHe: string;
  nameEn: string | null;
  /** Raw value of the "קואורדינטות" column; parse with parseCbsCoordinates. */
  coordinates: number | null;
}

export class LocalitiesClient {
  constructor(private readonly http: HttpClient) {}

  async fetchAll(): Promise<CbsLocality[]> {
    const params = new URLSearchParams({
      resource_id: CBS_LOCALITIES_RESOURCE_ID,
      limit: '5000',
      fields: [FIELD_CODE, FIELD_NAME_HE, FIELD_NAME_EN, FIELD_COORDINATES].join(','),
    });
    const body = await this.http.getJson(`${DATASTORE_URL}?${params.toString()}`, {
      schema: responseSchema,
      timeoutMs: 20_000,
      // data.gov.il rejects requests without a User-Agent.
      headers: {
        'user-agent': 'RealEstateLens/0.1 (+https://github.com/KerenYaakov5/RealEstateLens)',
      },
    });
    return body.result.records.map((record): CbsLocality => {
      return {
        code: record[FIELD_CODE],
        nameHe: record[FIELD_NAME_HE].trim(),
        nameEn: record[FIELD_NAME_EN]?.trim() ?? null,
        coordinates: record[FIELD_COORDINATES] ?? null,
      };
    });
  }
}
