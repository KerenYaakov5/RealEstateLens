import { count, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { deals } from '../db/schema.js';
import { chunk, excludedSet } from './upsertHelpers.js';

export type NewDeal = typeof deals.$inferInsert;

const UPSERT_CHUNK_SIZE = 200;

const UPDATABLE_COLUMNS = [
  'cityId',
  'neighborhoodId',
  'street',
  'propertyType',
  'rooms',
  'sizeSqm',
  'floor',
  'totalFloors',
  'yearBuilt',
  'condition',
  'hasElevator',
  'hasParking',
  'hasBalcony',
  'hasSafeRoom',
  'dealDate',
  'priceNis',
  'pricePerSqm',
  'sourcePricePerSqm',
  'source',
  'sourceRow',
] as const;

export class DealRepository {
  constructor(private readonly db: Database) {}

  async count(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(deals);
    return row?.value ?? 0;
  }

  /** Inserts new deals and overwrites existing ones (matched by deal_id). */
  async upsertMany(rows: readonly NewDeal[]): Promise<number> {
    let affected = 0;
    for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
      const result = await this.db
        .insert(deals)
        .values(batch)
        .onConflictDoUpdate({
          target: deals.dealId,
          set: { ...excludedSet(deals, UPDATABLE_COLUMNS), updatedAt: sql`now()` },
        })
        .returning({ id: deals.id });
      affected += result.length;
    }
    return affected;
  }
}
