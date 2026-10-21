import { describe, expect, it, vi } from 'vitest';
import { HttpClient, type FetchFn } from '../../src/clients/httpClient.js';
import { LocalitiesClient } from '../../src/clients/dataGov/localitiesClient.js';
import { logger } from '../../src/lib/logger.js';

const FIELDS = [
  'סמל יישוב',
  'שם יישוב',
  'שם יישוב באנגלית',
  'קואורדינטות',
  'סך הכל אוכלוסייה 2023',
];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** Answers data.gov.il's CKAN API: the dataset metadata, the field list, then the records. */
function ckan(options: {
  resources?: unknown[];
  fields?: string[];
  records?: Record<string, unknown>[];
  total?: number;
}) {
  const records = options.records ?? [];
  const total = options.total ?? records.length;
  const fetchFn = vi.fn<FetchFn>((input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/package_show')) {
      return Promise.resolve(
        json({ success: true, result: { resources: options.resources ?? [] } }),
      );
    }
    if (url.searchParams.get('limit') === '0') {
      const fields = (options.fields ?? FIELDS).map((id) => ({ id }));
      return Promise.resolve(json({ success: true, result: { total, fields } }));
    }
    return Promise.resolve(json({ success: true, result: { total, records } }));
  });
  // No retries: every answer here is final.
  const http = new HttpClient(logger, fetchFn, () => Promise.resolve());
  return { client: new LocalitiesClient(http), fetchFn };
}

describe('LocalitiesClient.findLatestFile', () => {
  it('picks the newest yearly file that is queryable', async () => {
    const { client } = ckan({
      resources: [
        {
          id: 'a',
          name: 'קובץ היישובים 2022',
          last_modified: '2023-01-01',
          datastore_active: true,
        },
        {
          id: 'b',
          name: 'קובץ היישובים 2024',
          last_modified: '2025-02-01',
          datastore_active: true,
        },
        // Newer, but only a downloadable file – it cannot be read through the API.
        { id: 'c', name: 'קובץ היישובים 2025', last_modified: null, datastore_active: false },
        { id: 'd', name: 'מילון שדות', datastore_active: true },
      ],
    });

    await expect(client.findLatestFile()).resolves.toEqual({
      resourceId: 'b',
      year: 2024,
      lastModified: '2025-02-01',
    });
  });

  it('fails when the dataset has no localities file at all', async () => {
    const { client } = ckan({ resources: [{ id: 'd', name: 'מילון שדות' }] });

    await expect(client.findLatestFile()).rejects.toThrow('No localities file');
  });
});

describe('LocalitiesClient.fetchAll', () => {
  it('reads every locality, with the population column whatever its year', async () => {
    const { client, fetchFn } = ckan({
      records: [
        {
          'סמל יישוב': 6600,
          'שם יישוב': ' חולון ',
          'שם יישוב באנגלית': 'HOLON',
          קואורדינטות: 179253658225,
          'סך הכל אוכלוסייה 2023': 197000,
        },
      ],
    });

    await expect(client.fetchAll('res')).resolves.toEqual([
      {
        code: 6600,
        nameHe: 'חולון',
        nameEn: 'HOLON',
        coordinates: 179253658225,
        transliteration: null,
        municipalStatus: null,
        population: 197000,
      },
    ]);
    const recordsUrl = new URL(String(fetchFn.mock.calls[1]?.[0]));
    expect(recordsUrl.searchParams.get('fields')).toContain('סך הכל אוכלוסייה 2023');
  });

  it('skips records without a code or a name and keeps unknown values unknown', async () => {
    const { client } = ckan({
      records: [
        { 'סמל יישוב': null, 'שם יישוב': 'בלי סמל' },
        { 'סמל יישוב': 70, 'שם יישוב': '   ' },
        { 'סמל יישוב': 71, 'שם יישוב': 'יישוב', קואורדינטות: 'not a number' },
      ],
    });

    const localities = await client.fetchAll('res');

    expect(localities).toHaveLength(1);
    expect(localities[0]).toMatchObject({ code: 71, coordinates: null, nameEn: null });
  });

  it('refuses a file that lacks a required column', async () => {
    const { client } = ckan({ fields: ['סמל יישוב', 'שם יישוב'] });

    await expect(client.fetchAll('res')).rejects.toThrow('lacks fields: קואורדינטות');
  });

  it('refuses a partial answer rather than storing part of the list', async () => {
    const { client } = ckan({ records: [{ 'סמל יישוב': 1, 'שם יישוב': 'א' }], total: 1200 });

    await expect(client.fetchAll('res')).rejects.toThrow('returned 1 of 1200');
  });

  it('refuses an answer in an unexpected shape', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json({ success: false })));
    const client = new LocalitiesClient(new HttpClient(logger, fetchFn, () => Promise.resolve()));

    await expect(client.fetchAll('res')).rejects.toThrow('Unexpected response shape');
  });
});
