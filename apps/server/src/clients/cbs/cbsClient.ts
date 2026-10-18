import { z } from 'zod';
import type { HttpClient } from '../httpClient.js';

/** CBS "Prices of Dwellings" index (monthly). */
export const DWELLING_PRICES_SERIES = 40010;

const BASE_URL = 'https://api.cbs.gov.il/index/data/price';

const monthPointSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  currBase: z.object({ baseDesc: z.string(), value: z.number().positive() }),
});

const responseSchema = z.object({
  month: z.array(z.object({ code: z.number(), date: z.array(monthPointSchema) })).default([]),
});

export interface MonthPeriod {
  year: number;
  month: number;
}

export interface IndexPoint extends MonthPeriod {
  value: number;
  baseDesc: string;
}

function formatPeriod(period: MonthPeriod): string {
  return `${String(period.month).padStart(2, '0')}-${period.year}`;
}

export class CbsClient {
  constructor(private readonly http: HttpClient) {}

  /** Monthly values of a CBS price index series, oldest first. */
  async getMonthlyIndex(series: number, from: MonthPeriod, to: MonthPeriod): Promise<IndexPoint[]> {
    const params = new URLSearchParams({
      id: String(series),
      format: 'json',
      download: 'false',
      lang: 'en',
      startPeriod: formatPeriod(from),
      endPeriod: formatPeriod(to),
      PageSize: '500',
    });
    const body = await this.http.getJson(`${BASE_URL}?${params.toString()}`, {
      schema: responseSchema,
      timeoutMs: 15_000,
    });
    const points = body.month
      .filter((entry) => {
        return entry.code === series;
      })
      .flatMap((entry) => {
        return entry.date;
      })
      .map((point): IndexPoint => {
        return {
          year: point.year,
          month: point.month,
          value: point.currBase.value,
          baseDesc: point.currBase.baseDesc,
        };
      });
    return points.sort((a, b) => {
      return a.year - b.year || a.month - b.month;
    });
  }
}
