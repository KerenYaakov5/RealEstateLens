import {
  neighborhoodKey,
  type PricedDeal,
  type SnapshotCity,
  type SnapshotNeighborhood,
} from './types.js';

/** Lookups derived once per snapshot, so requests never rescan deals or cities. */
export interface MarketIndexes {
  citiesById: ReadonlyMap<number, SnapshotCity>;
  neighborhoodsById: ReadonlyMap<number, SnapshotNeighborhood>;
  /** neighborhoodKey(cityKey, name) → neighborhood id */
  neighborhoodIdByKey: ReadonlyMap<string, number>;
  dealCountByCity: ReadonlyMap<string, number>;
  /** neighborhoodKey(cityKey, name) → deal count */
  dealCountByNeighborhood: ReadonlyMap<string, number>;
}

/** Deals already priced in today's terms, plus places – what the engine and queries work on. */
export interface PricedMarket {
  deals: readonly PricedDeal[];
  /** Keyed by city key (the engine's identifier). */
  cities: ReadonlyMap<string, SnapshotCity>;
  neighborhoods: readonly SnapshotNeighborhood[];
  /** Search keys (normalized names and aliases) per city key – precomputed for fast search. */
  searchNames: ReadonlyMap<string, readonly string[]>;
  /** The CBS index month prices are expressed in (YYYY-MM-01), or null. */
  referencePeriod: string | null;
  indexes: MarketIndexes;
}

export type MarketParts = Omit<PricedMarket, 'indexes'>;

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Builds a market snapshot with its indexes. */
export function createPricedMarket(parts: MarketParts): PricedMarket {
  const dealCountByCity = new Map<string, number>();
  const dealCountByNeighborhood = new Map<string, number>();
  for (const deal of parts.deals) {
    increment(dealCountByCity, deal.cityKey);
    if (deal.neighborhood !== null) {
      increment(dealCountByNeighborhood, neighborhoodKey(deal.cityKey, deal.neighborhood));
    }
  }
  return {
    ...parts,
    indexes: {
      citiesById: new Map(
        [...parts.cities.values()].map((city) => {
          return [city.id, city] as const;
        }),
      ),
      neighborhoodsById: new Map(
        parts.neighborhoods.map((neighborhood) => {
          return [neighborhood.id, neighborhood] as const;
        }),
      ),
      neighborhoodIdByKey: new Map(
        parts.neighborhoods.map((neighborhood) => {
          return [
            neighborhoodKey(neighborhood.cityKey, neighborhood.name),
            neighborhood.id,
          ] as const;
        }),
      ),
      dealCountByCity,
      dealCountByNeighborhood,
    },
  };
}
