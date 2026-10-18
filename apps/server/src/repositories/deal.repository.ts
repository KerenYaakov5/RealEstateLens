import { count, eq, min, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { cities, deals, neighborhoods } from '../db/schema.js';
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

  /** Every deal with its city key and neighborhood name – the input of the in-memory snapshot. */
  async findAllForSnapshot() {
    return this.db
      .select({
        dealId: deals.dealId,
        cityKey: cities.key,
        neighborhood: neighborhoods.name,
        street: deals.street,
        propertyType: deals.propertyType,
        rooms: deals.rooms,
        sizeSqm: deals.sizeSqm,
        floor: deals.floor,
        totalFloors: deals.totalFloors,
        yearBuilt: deals.yearBuilt,
        condition: deals.condition,
        hasSafeRoom: deals.hasSafeRoom,
        hasElevator: deals.hasElevator,
        hasParking: deals.hasParking,
        hasBalcony: deals.hasBalcony,
        dealDate: deals.dealDate,
        priceNis: deals.priceNis,
        source: deals.source,
      })
      .from(deals)
      .innerJoin(cities, eq(deals.cityId, cities.id))
      .leftJoin(neighborhoods, eq(deals.neighborhoodId, neighborhoods.id));
  }

  /** Earliest deal date (YYYY-MM-DD), or null when no deal has a date. */
  async earliestDealDate(): Promise<string | null> {
    const [row] = await this.db.select({ value: min(deals.dealDate) }).from(deals);
    return row?.value ?? null;
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
