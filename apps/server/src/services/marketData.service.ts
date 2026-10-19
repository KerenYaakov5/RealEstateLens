import { DWELLING_PRICES_SERIES } from '../clients/cbs/cbsClient.js';
import type { Logger } from '../lib/logger.js';
import { MemoryCache } from '../lib/memoryCache.js';
import type { CityRepository } from '../repositories/city.repository.js';
import type { DealRepository } from '../repositories/deal.repository.js';
import type { NeighborhoodRepository } from '../repositories/neighborhood.repository.js';
import type { PriceIndexRepository } from '../repositories/priceIndex.repository.js';
import { createPricedMarket, type PricedMarket } from './assessment/market.js';
import { createPriceAdjuster } from './assessment/priceAdjuster.js';
import type { SnapshotCity, SnapshotDeal } from './assessment/types.js';
import { searchKey } from './search/textMatch.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * The market (deals, cities, price index) held in memory and priced once, so assessments never
 * touch the DB per request. Lookup order: memory → DB. External sources are refreshed into the
 * DB at startup by their own services; `invalidate()` forces a reload (e.g. after a re-seed).
 */
export class MarketDataService {
  private readonly cache: MemoryCache<PricedMarket>;

  constructor(
    private readonly repositories: {
      deals: DealRepository;
      cities: CityRepository;
      neighborhoods: NeighborhoodRepository;
      priceIndex: PriceIndexRepository;
    },
    private readonly logger: Logger,
    ttlMs: number = DEFAULT_TTL_MS,
  ) {
    this.cache = new MemoryCache(
      () => this.load(),
      ttlMs,
      Date.now,
      (err) => {
        this.logger.warn({ err }, 'Market reload failed – serving the previous snapshot');
      },
    );
  }

  getMarket(): Promise<PricedMarket> {
    return this.cache.get();
  }

  invalidate(): void {
    this.cache.invalidate();
  }

  private async load(): Promise<PricedMarket> {
    const startedAt = Date.now();
    const [dealRows, cityRows, aliasRows, neighborhoodRows, indexRows] = await Promise.all([
      this.repositories.deals.findAllForSnapshot(),
      this.repositories.cities.findAll(),
      this.repositories.cities.findAllAliases(),
      this.repositories.neighborhoods.findAll(),
      this.repositories.priceIndex.findSeries(DWELLING_PRICES_SERIES),
    ]);

    const adjuster = createPriceAdjuster(
      indexRows.map((row) => {
        return { period: row.period, value: row.value };
      }),
    );
    const deals = dealRows.map((row) => {
      const deal: SnapshotDeal = {
        id: row.id,
        dealId: row.dealId,
        cityKey: row.cityKey,
        neighborhood: row.neighborhood,
        street: row.street,
        propertyType: row.propertyType,
        rooms: row.rooms,
        sizeSqm: row.sizeSqm,
        floor: row.floor,
        totalFloors: row.totalFloors,
        yearBuilt: row.yearBuilt,
        condition: row.condition,
        features: {
          safeRoom: row.hasSafeRoom,
          elevator: row.hasElevator,
          parking: row.hasParking,
          balcony: row.hasBalcony,
        },
        dealDate: row.dealDate,
        priceNis: row.priceNis,
        source: row.source,
      };
      return adjuster.adjust(deal);
    });
    const cities = new Map(
      cityRows.map((row): [string, SnapshotCity] => {
        const location =
          row.itmX !== null && row.itmY !== null ? { x: row.itmX, y: row.itmY } : null;
        return [
          row.key,
          {
            id: row.id,
            key: row.key,
            nameHe: row.nameHe,
            nameEn: row.nameEn,
            municipalStatus: row.municipalStatus,
            population: row.population,
            location,
          },
        ];
      }),
    );

    this.logger.info(
      {
        deals: deals.length,
        cities: cities.size,
        referencePeriod: adjuster.referencePeriod,
        ms: Date.now() - startedAt,
      },
      'Market snapshot loaded into memory',
    );
    const keyById = new Map(
      cityRows.map((row) => {
        return [row.id, row.key] as const;
      }),
    );
    const names = new Map<string, Set<string>>();
    const addName = (cityKey: string, name: string | null): void => {
      if (name === null) {
        return;
      }
      const key = searchKey(name);
      if (key.length > 0) {
        const set = names.get(cityKey) ?? new Set<string>();
        set.add(key);
        names.set(cityKey, set);
      }
    };
    for (const row of cityRows) {
      addName(row.key, row.nameHe);
      addName(row.key, row.nameEn);
    }
    for (const alias of aliasRows) {
      const cityKey = keyById.get(alias.cityId);
      if (cityKey !== undefined) {
        addName(cityKey, alias.alias);
      }
    }
    const searchNames = new Map(
      [...names].map(([cityKey, set]) => {
        return [cityKey, [...set]] as const;
      }),
    );

    return createPricedMarket({
      deals,
      cities,
      neighborhoods: neighborhoodRows,
      searchNames,
      referencePeriod: adjuster.referencePeriod,
    });
  }
}
