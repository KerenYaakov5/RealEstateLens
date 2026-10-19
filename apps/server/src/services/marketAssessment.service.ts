import type { AssessmentQuery, CompromiseDto, MarketAssessmentDto } from '@rel/shared';
import { LruCache } from '../lib/lruCache.js';
import { assess, type PricedMarket } from './assessment/assess.js';
import { ASSESSMENT_CONFIG } from './assessment/config.js';
import type { CompromiseCandidate } from './assessment/compromises.js';
import { createDealMapper } from './marketQueries.js';

export type AssessmentOutcome =
  | { ok: true; assessment: MarketAssessmentDto }
  | { ok: false; reason: 'unknown-city' | 'unknown-neighborhood' };

const RESULTS_PER_SNAPSHOT = 500;

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

/**
 * Runs assessments for API requests: translates numeric ids to the engine's keys and shapes the
 * response. Results are cached per market snapshot (memory first); a reloaded snapshot starts
 * with an empty cache, so cached answers never outlive the data they came from.
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
    const city = [...market.cities.values()].find((item) => {
      return item.id === query.cityId;
    });
    if (city === undefined) {
      return { ok: false, reason: 'unknown-city' };
    }
    let neighborhood: { id: number; name: string } | null = null;
    if (query.neighborhoodId !== undefined) {
      const found = market.neighborhoods.find((item) => {
        return item.id === query.neighborhoodId && item.cityKey === city.key;
      });
      if (found === undefined) {
        return { ok: false, reason: 'unknown-neighborhood' };
      }
      neighborhood = { id: found.id, name: found.name };
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
      ok: true,
      assessment: {
        city: { id: city.id, name: city.nameHe },
        neighborhood,
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
