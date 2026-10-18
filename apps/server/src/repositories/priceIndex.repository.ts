import { asc, eq, sql } from 'drizzle-orm';
import type { IndexPoint } from '../clients/cbs/cbsClient.js';
import type { Database } from '../db/client.js';
import { priceIndex } from '../db/schema.js';
import { excludedSet } from './upsertHelpers.js';

export type StoredIndexPoint = typeof priceIndex.$inferSelect;

export function toPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export class PriceIndexRepository {
  constructor(private readonly db: Database) {}

  async findSeries(seriesCode: number): Promise<StoredIndexPoint[]> {
    return this.db
      .select()
      .from(priceIndex)
      .where(eq(priceIndex.seriesCode, seriesCode))
      .orderBy(asc(priceIndex.period));
  }

  /** Stores the points; the `provisionalCount` most recent months are flagged as provisional. */
  async upsertSeries(
    seriesCode: number,
    points: readonly IndexPoint[],
    provisionalCount: number,
  ): Promise<void> {
    if (points.length === 0) {
      return;
    }
    const firstProvisional = points.length - provisionalCount;
    await this.db
      .insert(priceIndex)
      .values(
        points.map((point, i) => {
          return {
            seriesCode,
            period: toPeriod(point.year, point.month),
            value: point.value,
            baseDesc: point.baseDesc,
            isProvisional: i >= firstProvisional,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [priceIndex.seriesCode, priceIndex.period],
        set: {
          ...excludedSet(priceIndex, ['value', 'baseDesc', 'isProvisional']),
          fetchedAt: sql`now()`,
        },
      });
  }
}
