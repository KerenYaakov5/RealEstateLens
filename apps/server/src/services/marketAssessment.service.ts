import type {
  AssessmentNoticeDto,
  AssessmentQuery,
  CompromiseDto,
  MarketAssessmentDto,
  NearbyCityDto,
} from '@rel/shared';
import { LruCache } from '../lib/lruCache.js';
import { assess } from './assessment/assess.js';
import { ASSESSMENT_CONFIG } from './assessment/config.js';
import type { CompromiseCandidate } from './assessment/compromises.js';
import type { PricedMarket } from './assessment/market.js';
import type { SnapshotCity } from './assessment/types.js';
import { distanceKm } from './geo/itm.js';
import { createDealMapper } from './marketQueries.js';
import { resolveNeighborhood } from './search/placeSearch.js';
import { searchKey } from './search/textMatch.js';

export type AssessmentOutcome =
  | { status: 'ok'; assessment: MarketAssessmentDto }
  /** Nothing at all to show (no deals in the city and no nearby city with deals) → 204. */
  | { status: 'no-content' }
  | { status: 'not-found'; reason: 'unknown-city' | 'unknown-neighborhood' };

const RESULTS_PER_SNAPSHOT = 500;
const NEARBY_CITIES_WHEN_NO_DATA = 3;

const METHODOLOGY = {
  minDealsForRate: ASSESSMENT_CONFIG.confidence.minPoolForRate,
  confidenceMediumFrom: ASSESSMENT_CONFIG.confidence.mediumFrom,
  confidenceHighFrom: ASSESSMENT_CONFIG.confidence.highFrom,
  roomsTolerance: ASSESSMENT_CONFIG.roomsTolerance,
  nearbyCityMaxKm: ASSESSMENT_CONFIG.nearbyCityMaxKm,
  maxBudgetRatio: ASSESSMENT_CONFIG.maxBudgetRatio,
  priceIndexSource: 'הלמ"ס – מדד מחירי דירות (סדרה 40010)',
} as const;

/** Stable cache key: the parsed query with keys in a fixed order. */
function cacheKey(query: AssessmentQuery): string {
  return JSON.stringify(
    Object.keys(query)
      .sort()
      .map((key) => {
        return [key, query[key as keyof AssessmentQuery]];
      }),
  );
}

/** The nearest cities that have deals, by official distance – offered when a city has none. */
function nearestCitiesWithData(market: PricedMarket, origin: SnapshotCity): NearbyCityDto[] {
  if (origin.location === null) {
    return [];
  }
  const from = origin.location;
  return [...market.indexes.dealCountByCity]
    .flatMap(([key, dealCount]) => {
      const city = market.cities.get(key);
      if (city === undefined || city.location === null || city.key === origin.key) {
        return [];
      }
      const km = Math.round(distanceKm(from, city.location) * 10) / 10;
      return [{ id: city.id, name: city.nameHe, distanceKm: km, dealCount }];
    })
    .sort((a, b) => {
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, NEARBY_CITIES_WHEN_NO_DATA);
}

/**
 * Runs assessments for API requests: translates numeric ids and free-text neighborhoods to the
 * engine's keys, explains missing data with notices, and shapes the response. Results are
 * cached per market snapshot (memory first); a reloaded snapshot starts with an empty cache.
 */
export class MarketAssessmentService {
  private readonly cachesBySnapshot = new WeakMap<PricedMarket, LruCache<AssessmentOutcome>>();

  run(market: PricedMarket, query: AssessmentQuery): AssessmentOutcome {
    let cache = this.cachesBySnapshot.get(market);
    if (cache === undefined) {
      cache = new LruCache(RESULTS_PER_SNAPSHOT);
      this.cachesBySnapshot.set(market, cache);
    }
    const key = cacheKey(query);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const outcome = this.compute(market, query);
    cache.set(key, outcome);
    return outcome;
  }

  private compute(market: PricedMarket, query: AssessmentQuery): AssessmentOutcome {
    const city = market.indexes.citiesById.get(query.cityId);
    if (city === undefined) {
      return { status: 'not-found', reason: 'unknown-city' };
    }

    const notices: AssessmentNoticeDto[] = [];
    let nearbyCitiesWithData: NearbyCityDto[] = [];
    const cityHasDeals = market.indexes.dealCountByCity.has(city.key);
    if (!cityHasDeals) {
      nearbyCitiesWithData = nearestCitiesWithData(market, city);
      if (nearbyCitiesWithData.length === 0) {
        return { status: 'no-content' };
      }
      notices.push({
        code: 'CITY_NO_DATA',
        message: `אין לנו עסקאות ב${city.nameHe}. אלה הערים הקרובות ביותר שיש לנו עליהן נתונים.`,
      });
    }

    let neighborhood: { id: number; name: string } | null = null;
    if (query.neighborhoodId !== undefined) {
      const found = market.indexes.neighborhoodsById.get(query.neighborhoodId);
      if (found === undefined || found.cityKey !== city.key) {
        return { status: 'not-found', reason: 'unknown-neighborhood' };
      }
      neighborhood = { id: found.id, name: found.name };
    } else if (query.neighborhood !== undefined && cityHasDeals) {
      const hit = resolveNeighborhood(market, city.key, query.neighborhood);
      if (hit === null) {
        notices.push({
          code: 'NEIGHBORHOOD_NO_DATA',
          message: `אין לנו עסקאות בשכונה "${query.neighborhood}". מוצגות תוצאות לכל ${city.nameHe}.`,
        });
      } else {
        neighborhood = { id: hit.neighborhood.id, name: hit.neighborhood.name };
        // Tell the user whenever the results are for a name other than what they typed
        // (a typo, a partial name, or another spelling such as "Florentin").
        if (searchKey(query.neighborhood) !== searchKey(hit.neighborhood.name)) {
          notices.push({
            code: 'NEIGHBORHOOD_MATCHED',
            message: `מוצגות תוצאות עבור השכונה "${hit.neighborhood.name}".`,
          });
        }
      }
    }

    const result = assess(market, {
      cityKey: city.key,
      maxPrice: query.maxPrice,
      ...(neighborhood === null ? {} : { neighborhood: neighborhood.name }),
      ...(query.rooms === undefined ? {} : { rooms: query.rooms }),
      ...(query.propertyType === undefined ? {} : { propertyTypes: query.propertyType }),
      ...(query.condition === undefined ? {} : { conditions: query.condition }),
      ...(query.minSize === undefined ? {} : { minSizeSqm: query.minSize }),
      ...(query.minFloor === undefined ? {} : { minFloor: query.minFloor }),
      ...(query.maxFloor === undefined ? {} : { maxFloor: query.maxFloor }),
      features: {
        safeRoom: query.safeRoom,
        elevator: query.elevator,
        parking: query.parking,
        balcony: query.balcony,
      },
    });

    const toDeal = createDealMapper(market);
    return {
      status: 'ok',
      assessment: {
        city: { id: city.id, name: city.nameHe },
        neighborhood,
        notices,
        nearbyCitiesWithData,
        referencePeriod: result.referencePeriod,
        feasibility: result.feasibility,
        cityLevel: result.cityLevel,
        compromises: result.compromises.map((candidate) => {
          return toCompromiseDto(candidate, market);
        }),
        typicalForBudget: result.typicalForBudget,
        houseParts: result.houseParts,
        referenceDeals: result.referenceDeals.map((deal) => {
          return { ...toDeal(deal), matchedPreferences: deal.matchedPreferences };
        }),
        methodology: METHODOLOGY,
      },
    };
  }
}

/** Swaps the engine's internal city key for the public numeric id. */
function toCompromiseDto(candidate: CompromiseCandidate, market: PricedMarket): CompromiseDto {
  const { cityKey, ...params } = candidate.params;
  const cityId = cityKey === undefined ? undefined : market.cities.get(cityKey)?.id;
  return {
    id: candidate.id,
    type: candidate.type,
    params: cityId === undefined ? params : { ...params, cityId },
    feasibility: candidate.feasibility,
    delta: candidate.delta,
    facts: candidate.facts.filter((fact) => {
      return fact.key !== 'cityKey';
    }),
  };
}
