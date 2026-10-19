import { normalizeNeighborhood } from '../../import/normalizers/location.js';
import type { PricedMarket } from '../assessment/assess.js';
import type { SnapshotCity, SnapshotNeighborhood } from '../assessment/types.js';
import { bestMatch, searchKey, type TextMatch } from './textMatch.js';

export const DEFAULT_SEARCH_LIMIT = 10;

export interface CitySearchHit {
  city: SnapshotCity;
  dealCount: number;
  match: TextMatch;
}

export interface NeighborhoodSearchHit {
  neighborhood: SnapshotNeighborhood;
  dealCount: number;
  match: TextMatch;
}

// Deal counts are derived once per market snapshot (a new snapshot gets new counts).
const cityCounts = new WeakMap<PricedMarket, Map<string, number>>();
const neighborhoodCounts = new WeakMap<PricedMarket, Map<string, number>>();

function dealCountsByCity(market: PricedMarket): Map<string, number> {
  let counts = cityCounts.get(market);
  if (counts === undefined) {
    counts = new Map();
    for (const deal of market.deals) {
      counts.set(deal.cityKey, (counts.get(deal.cityKey) ?? 0) + 1);
    }
    cityCounts.set(market, counts);
  }
  return counts;
}

function dealCountsByNeighborhood(market: PricedMarket): Map<string, number> {
  let counts = neighborhoodCounts.get(market);
  if (counts === undefined) {
    counts = new Map();
    for (const deal of market.deals) {
      if (deal.neighborhood !== null) {
        const key = `${deal.cityKey}|${deal.neighborhood}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    neighborhoodCounts.set(market, counts);
  }
  return counts;
}

/** Cities (status 0) before local councils (99) before other localities. */
function municipalRank(status: number | null): number {
  if (status === 0) {
    return 2;
  }
  if (status === 99) {
    return 1;
  }
  return 0;
}

/**
 * Searches every official locality by Hebrew name, English name, transliteration and hand-made
 * aliases, tolerating partial words, typos and mixed Hebrew/English. Ranked by match quality,
 * then places with deals, then cities and local councils, then population.
 */
export function searchCities(
  market: PricedMarket,
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): CitySearchHit[] {
  const key = searchKey(query);
  const counts = dealCountsByCity(market);
  const hits: CitySearchHit[] = [];
  for (const city of market.cities.values()) {
    const match = bestMatch(key, market.searchNames.get(city.key) ?? []);
    if (match !== null) {
      hits.push({ city, dealCount: counts.get(city.key) ?? 0, match });
    }
  }
  return hits
    .sort((a, b) => {
      return (
        b.match.score - a.match.score ||
        Number(b.dealCount > 0) - Number(a.dealCount > 0) ||
        municipalRank(b.city.municipalStatus) - municipalRank(a.city.municipalStatus) ||
        (b.city.population ?? 0) - (a.city.population ?? 0) ||
        a.city.nameHe.localeCompare(b.city.nameHe, 'he')
      );
    })
    .slice(0, limit);
}

/** Searches the neighborhoods we have deals for in one city. */
export function searchNeighborhoods(
  market: PricedMarket,
  cityKey: string,
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): NeighborhoodSearchHit[] {
  // Canonicalize known variants first ("Florentin" → "פלורנטין", "רמב"ש ג'" → full name).
  const canonical = normalizeNeighborhood(query);
  const key = searchKey(canonical.ok && canonical.value !== null ? canonical.value : query);
  const counts = dealCountsByNeighborhood(market);
  const hits: NeighborhoodSearchHit[] = [];
  for (const neighborhood of market.neighborhoods) {
    if (neighborhood.cityKey !== cityKey) {
      continue;
    }
    const match = bestMatch(key, [searchKey(neighborhood.name)]);
    if (match !== null) {
      hits.push({
        neighborhood,
        dealCount: counts.get(`${cityKey}|${neighborhood.name}`) ?? 0,
        match,
      });
    }
  }
  return hits
    .sort((a, b) => {
      return (
        b.match.score - a.match.score ||
        b.dealCount - a.dealCount ||
        a.neighborhood.name.localeCompare(b.neighborhood.name, 'he')
      );
    })
    .slice(0, limit);
}

/**
 * Resolves free text typed as a neighborhood to one neighborhood we have data for, or null.
 * Accepted: an exact or fuzzy (typo) match, or a partial name that fits exactly one neighborhood.
 * Free text is never added to the neighborhood list.
 */
export function resolveNeighborhood(
  market: PricedMarket,
  cityKey: string,
  text: string,
): NeighborhoodSearchHit | null {
  const hits = searchNeighborhoods(market, cityKey, text, Number.MAX_SAFE_INTEGER);
  const [top] = hits;
  if (top === undefined) {
    return null;
  }
  if (top.match.kind === 'exact' || top.match.kind === 'fuzzy') {
    return top;
  }
  const partial = hits.filter((hit) => {
    return hit.match.kind !== 'contains';
  });
  return partial.length === 1 ? (partial[0] ?? null) : null;
}
