import { and, count, isNotNull, isNull, sql } from 'drizzle-orm';
import type { CityReference } from '../data/cities.js';
import type { Database } from '../db/client.js';
import { cities, cityAliases } from '../db/schema.js';
import { cleanText, toMatchKey } from '../import/normalizers/text.js';
import type { ItmPoint } from '../services/geo/itm.js';
import { chunk, excludedSet } from './upsertHelpers.js';

export interface OfficialLocality {
  code: number;
  nameHe: string;
  nameEn: string | null;
  transliteration: string | null;
  municipalStatus: number | null;
  population: number | null;
  location: ItmPoint | null;
}

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

  async findAll() {
    return this.db
      .select({
        id: cities.id,
        key: cities.key,
        nameHe: cities.nameHe,
        nameEn: cities.nameEn,
        municipalStatus: cities.municipalStatus,
        population: cities.population,
        itmX: cities.itmX,
        itmY: cities.itmY,
      })
      .from(cities);
  }

  /** Number of stored localities that come from the official CBS file. */
  async countLocalities(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(cities)
      .where(isNotNull(cities.cbsCode));
    return row?.value ?? 0;
  }

  /**
   * Localities with an official CBS code that were never loaded from the official file (e.g. a
   * reference city added before the first load). A locality the file has no coordinates for does
   * not count – it was loaded, its coordinates are officially unknown.
   */
  async findNotYetLoaded(): Promise<CityNeedingCoordinates[]> {
    const rows = await this.db
      .select({ id: cities.id, key: cities.key, cbsCode: cities.cbsCode })
      .from(cities)
      .where(and(isNotNull(cities.cbsCode), isNull(cities.coordinatesSource)));
    return rows.flatMap((row) => {
      return row.cbsCode === null ? [] : [{ id: row.id, key: row.key, cbsCode: row.cbsCode }];
    });
  }

  /**
   * Inserts every official locality, matched by CBS code. Existing rows (e.g. the reference
   * cities) keep their hand-checked key and names; only official facts are refreshed.
   * Official names become search aliases unless a spelling is already taken.
   */
  async upsertLocalities(localities: readonly OfficialLocality[], source: string): Promise<void> {
    for (const batch of chunk(localities, 200)) {
      await this.db
        .insert(cities)
        .values(
          batch.map((locality) => {
            return {
              key: `cbs-${locality.code}`,
              nameHe: locality.nameHe,
              nameEn: locality.nameEn,
              cbsCode: locality.code,
              municipalStatus: locality.municipalStatus,
              population: locality.population,
              itmX: locality.location?.x ?? null,
              itmY: locality.location?.y ?? null,
              coordinatesSource: source,
              coordinatesUpdatedAt: sql`now()`,
            };
          }),
        )
        .onConflictDoUpdate({
          target: cities.cbsCode,
          set: {
            ...excludedSet(cities, [
              'municipalStatus',
              'population',
              'itmX',
              'itmY',
              'coordinatesSource',
              'coordinatesUpdatedAt',
            ]),
            // Official names follow the newest file, except for the hand-checked reference cities.
            nameHe: sql`CASE WHEN ${cities.key} LIKE 'cbs-%' THEN excluded.name_he ELSE ${cities.nameHe} END`,
            nameEn: sql`CASE WHEN ${cities.key} LIKE 'cbs-%' THEN excluded.name_en ELSE ${cities.nameEn} END`,
            updatedAt: sql`now()`,
          },
        });
    }

    const ids = await this.db
      .select({ id: cities.id, cbsCode: cities.cbsCode })
      .from(cities)
      .where(isNotNull(cities.cbsCode));
    const idByCode = new Map(
      ids.map((row) => {
        return [row.cbsCode, row.id] as const;
      }),
    );
    const aliases = localities.flatMap((locality) => {
      const cityId = idByCode.get(locality.code);
      if (cityId === undefined) {
        return [];
      }
      return [locality.nameHe, locality.nameEn, locality.transliteration].flatMap((name) => {
        const cleaned = cleanText(name ?? null);
        return cleaned === null ? [] : [{ cityId, alias: cleaned, matchKey: toMatchKey(cleaned) }];
      });
    });
    for (const batch of chunk(aliases, 500)) {
      await this.db.insert(cityAliases).values(batch).onConflictDoNothing();
    }
  }

  /** Every search alias with its city id – for the in-memory search index. */
  async findAllAliases() {
    return this.db
      .select({
        cityId: cityAliases.cityId,
        alias: cityAliases.alias,
        matchKey: cityAliases.matchKey,
      })
      .from(cityAliases);
  }
}
