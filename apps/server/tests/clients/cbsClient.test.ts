import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CbsClient, DWELLING_PRICES_SERIES } from '../../src/clients/cbs/cbsClient.js';
import { HttpClient, type FetchFn } from '../../src/clients/httpClient.js';
import { logger } from '../../src/lib/logger.js';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/cbs-dwellings-40010.json',
);

describe('CbsClient.getMonthlyIndex', () => {
  it('requests the series for the period and returns points oldest first', async () => {
    const body = await readFile(fixturePath, 'utf8');
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(new Response(body, { status: 200 }));
    const cbs = new CbsClient(new HttpClient(logger, fetchFn));

    const points = await cbs.getMonthlyIndex(
      DWELLING_PRICES_SERIES,
      { year: 2025, month: 11 },
      { year: 2026, month: 7 },
    );

    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.searchParams.get('id')).toBe('40010');
    expect(url.searchParams.get('startPeriod')).toBe('11-2025');
    expect(url.searchParams.get('endPeriod')).toBe('07-2026');

    expect(points).toHaveLength(9);
    expect(points[0]).toEqual({ year: 2025, month: 11, value: 600.8, baseDesc: 'Average 1993' });
    expect(points.at(-1)).toEqual({ year: 2026, month: 7, value: 590, baseDesc: 'Average 1993' });
  });
});
