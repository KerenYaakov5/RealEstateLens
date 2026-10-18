import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { CityReference } from '../data/cities.js';
import type { Database } from '../db/client.js';
import { cities, cityAliases } from '../db/schema.js';
import { cleanText, toMatchKey } from '../import/normalizers/text.js';
import type { ItmPoint } from '../services/geo/itm.js';
import { excludedSet } from './upsertHelpers.js';

export interface CityNeedingCoordinates {
  id: number;
  key: string;
  cbsCode: number;
}

export class CityRepository {
  constructor(private readonly db: Database) {}

  /** Inserts or refreshes the reference cities and their aliases. Returns city key → id. */
  async upsertReferenceCities(references: readonly CityReference[]): Promise<Map<string, number>> {
    const rows = await this.db
      .insert(cities)
      .values(
        references.map((city) => {
          return {
            key: city.key,
            nameHe: city.nameHe,
            nameEn: city.nameEn,
            cbsCode: city.cbsCode,
          };
        }),
      )
      .onConflictDoUpdate({
        target: cities.key,
        set: { ...excludedSet(cities, ['nameHe', 'nameEn', 'cbsCode']), updatedAt: sql`now()` },
      })
      .returning({ id: cities.id, key: cities.key });

    const idByKey = new Map(
      rows.map((row) => {
        return [row.key, row.id] as const;
      }),
    );

    const aliasRows = references.flatMap((city) => {
      const cityId = idByKey.get(city.key);
      if (cityId === undefined) {
        return [];
      }
      return [city.nameHe, city.nameEn, ...city.aliases].flatMap((alias) => {
        const cleaned = cleanText(alias);
        return cleaned === null ? [] : [{ cityId, alias: cleaned, matchKey: toMatchKey(cleaned) }];
      });
    });
    const uniqueAliases = [
      ...new Map(
        aliasRows.map((row) => {
          return [row.matchKey, row] as const;
        }),
      ).values(),
    ];
    if (uniqueAliases.length > 0) {
      await this.db
        .insert(cityAliases)
        .values(uniqueAliases)
        .onConflictDoUpdate({
          target: cityAliases.matchKey,
          set: excludedSet(cityAliases, ['cityId', 'alias']),
        });
    }

    return idByKey;
  }

  /** Cities with an official CBS code whose coordinates have not been loaded yet. */
  async findMissingCoordinates(): Promise<CityNeedingCoordinates[]> {
    const rows = await this.db
      .select({ id: cities.id, key: cities.key, cbsCode: cities.cbsCode })
      .from(cities)
      .where(and(isNotNull(cities.cbsCode), isNull(cities.itmX)));
    return rows.flatMap((row) => {
      return row.cbsCode === null ? [] : [{ id: row.id, key: row.key, cbsCode: row.cbsCode }];
    });
  }

  async setCoordinates(cityId: number, point: ItmPoint, source: string): Promise<void> {
    await this.db
      .update(cities)
      .set({
        itmX: point.x,
        itmY: point.y,
        coordinatesSource: source,
        coordinatesUpdatedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(cities.id, cityId));
  }
}
