import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { cities, neighborhoods } from '../db/schema.js';

export interface NeighborhoodKey {
  cityId: number;
  name: string;
}

/** Keys a neighborhood row by DB city id + name (the in-memory equivalent is neighborhoodKey). */
export function neighborhoodRowKey(key: NeighborhoodKey): string {
  return `${key.cityId}|${key.name}`;
}

export class NeighborhoodRepository {
  constructor(private readonly db: Database) {}

  /** Makes sure every (city, name) pair exists. Returns lookup key → id. */
  async ensure(keys: readonly NeighborhoodKey[]): Promise<Map<string, number>> {
    const unique = [
      ...new Map(
        keys.map((key) => {
          return [neighborhoodRowKey(key), key] as const;
        }),
      ).values(),
    ];
    if (unique.length === 0) {
      return new Map();
    }

    await this.db.insert(neighborhoods).values(unique).onConflictDoNothing();

    const cityIds = [
      ...new Set(
        unique.map((key) => {
          return key.cityId;
        }),
      ),
    ];
    const rows = await this.db
      .select({ id: neighborhoods.id, cityId: neighborhoods.cityId, name: neighborhoods.name })
      .from(neighborhoods)
      .where(inArray(neighborhoods.cityId, cityIds));

    return new Map(
      rows.map((row) => {
        return [neighborhoodRowKey(row), row.id] as const;
      }),
    );
  }

  /** Every neighborhood with its city key – for the in-memory snapshot. */
  async findAll() {
    return this.db
      .select({ id: neighborhoods.id, cityKey: cities.key, name: neighborhoods.name })
      .from(neighborhoods)
      .innerJoin(cities, eq(neighborhoods.cityId, cities.id));
  }
}
