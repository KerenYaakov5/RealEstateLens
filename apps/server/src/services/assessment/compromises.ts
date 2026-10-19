import {
  FEATURES,
  type CompromiseType,
  type FactDto as Fact,
  type Feature,
  type MarketCriteria,
} from '@rel/shared';
import { distanceKm } from '../geo/itm.js';
import { ASSESSMENT_CONFIG } from './config.js';
import { computeFeasibility, type Feasibility } from './feasibility.js';
import { buildPool, type PoolCriteria } from './pool.js';
import { nearestRank, sortedNumbers } from './stats.js';
import type { PricedMarket } from './market.js';
import type { PricedDeal } from './types.js';

export interface CompromiseCandidate {
  id: string;
  type: CompromiseType;
  params: {
    feature?: Feature;
    rooms?: number;
    neighborhood?: string;
    cityKey?: string;
    cityName?: string;
    distanceKm?: number;
    newMaxPrice?: number;
  };
  feasibility: Feasibility;
  /** Improvement in match rate over the current requirements (0–1). */
  delta: number;
  facts: Fact[];
}

interface Context {
  deals: readonly PricedDeal[];
  market: PricedMarket;
  criteria: MarketCriteria;
  baseline: Feasibility;
}

function withoutBudget(criteria: MarketCriteria): PoolCriteria {
  const { maxPrice: _maxPrice, ...rest } = criteria;
  return rest;
}

function makeCandidate(
  context: Context,
  id: string,
  type: CompromiseType,
  params: CompromiseCandidate['params'],
  feasibility: Feasibility,
): CompromiseCandidate | null {
  if (
    feasibility.matchRate === null ||
    feasibility.poolSize < ASSESSMENT_CONFIG.minCompromisePool
  ) {
    return null;
  }
  const delta = feasibility.matchRate - (context.baseline.matchRate ?? 0);
  if (delta <= 0) {
    return null;
  }
  const facts: Fact[] = [
    { id: `${id}#matchRate`, key: 'matchRate', value: feasibility.matchRate },
    { id: `${id}#poolSize`, key: 'poolSize', value: feasibility.poolSize },
    { id: `${id}#affordableCount`, key: 'affordableCount', value: feasibility.affordableCount },
  ];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      facts.push({ id: `${id}#${key}`, key, value });
    }
  }
  return { id, type, params, feasibility, delta, facts };
}

function evaluate(context: Context, criteria: PoolCriteria, maxPrice: number): Feasibility {
  return computeFeasibility(buildPool(context.deals, criteria), maxPrice);
}

function dropFeatureCandidates(context: Context): CompromiseCandidate[] {
  const base = withoutBudget(context.criteria);
  return FEATURES.filter((feature) => {
    return context.criteria.features[feature] === 'required';
  }).flatMap((feature) => {
    const relaxed: PoolCriteria = { ...base, features: { ...base.features, [feature]: 'any' } };
    const candidate = makeCandidate(
      context,
      `dropFeature:${feature}`,
      'dropFeature',
      { feature },
      evaluate(context, relaxed, context.criteria.maxPrice),
    );
    return candidate === null ? [] : [candidate];
  });
}

function fewerRoomsCandidate(context: Context): CompromiseCandidate[] {
  const rooms = context.criteria.rooms;
  if (rooms === undefined || rooms - 1 < 1) {
    return [];
  }
  const relaxed: PoolCriteria = { ...withoutBudget(context.criteria), rooms: rooms - 1 };
  const candidate = makeCandidate(
    context,
    'fewerRooms',
    'fewerRooms',
    { rooms: rooms - 1 },
    evaluate(context, relaxed, context.criteria.maxPrice),
  );
  return candidate === null ? [] : [candidate];
}

function neighborhoodCandidates(context: Context): CompromiseCandidate[] {
  const chosen = context.criteria.neighborhood;
  if (chosen === undefined) {
    return [];
  }
  const { neighborhood: _neighborhood, ...cityWide } = withoutBudget(context.criteria);
  const results: CompromiseCandidate[] = [];

  const anywhere = makeCandidate(
    context,
    'anyNeighborhood',
    'anyNeighborhood',
    {},
    evaluate(context, cityWide, context.criteria.maxPrice),
  );
  if (anywhere !== null) {
    results.push(anywhere);
  }

  // The single best other neighborhood in the same city (one card, not a list).
  const others = new Set(
    context.deals
      .filter((deal) => {
        return deal.cityKey === context.criteria.cityKey && deal.neighborhood !== null;
      })
      .map((deal) => {
        return deal.neighborhood as string;
      }),
  );
  others.delete(chosen);
  let best: CompromiseCandidate | null = null;
  for (const neighborhood of [...others].sort()) {
    const candidate = makeCandidate(
      context,
      `otherNeighborhood:${neighborhood}`,
      'otherNeighborhood',
      { neighborhood },
      evaluate(context, { ...cityWide, neighborhood }, context.criteria.maxPrice),
    );
    if (candidate !== null && (best === null || candidate.delta > best.delta)) {
      best = candidate;
    }
  }
  if (best !== null) {
    results.push(best);
  }
  return results;
}

function nearbyCityCandidates(context: Context): CompromiseCandidate[] {
  const origin = context.market.cities.get(context.criteria.cityKey)?.location;
  if (origin === undefined || origin === null) {
    return [];
  }
  const { neighborhood: _neighborhood, ...rest } = withoutBudget(context.criteria);
  // Only cities that have deals can yield a compromise – skip the other ~1,460 localities.
  return [...context.market.indexes.dealCountByCity.keys()].flatMap((cityKey) => {
    const city = context.market.cities.get(cityKey);
    if (city === undefined || city.key === context.criteria.cityKey || city.location === null) {
      return [];
    }
    const km = distanceKm(origin, city.location);
    if (km > ASSESSMENT_CONFIG.nearbyCityMaxKm) {
      return [];
    }
    const candidate = makeCandidate(
      context,
      `nearbyCity:${city.key}`,
      'nearbyCity',
      { cityKey: city.key, cityName: city.nameHe, distanceKm: Math.round(km * 10) / 10 },
      evaluate(context, { ...rest, cityKey: city.key }, context.criteria.maxPrice),
    );
    return candidate === null ? [] : [candidate];
  });
}

/**
 * The budget at which half of the pool becomes affordable – a price that was actually paid.
 * Not offered when that budget is beyond a realistic stretch (maxBudgetRatio × budget).
 */
function raiseBudgetCandidate(context: Context): CompromiseCandidate[] {
  const criteria = withoutBudget(context.criteria);
  const pool = buildPool(context.deals, criteria);
  const target = nearestRank(
    sortedNumbers(
      pool.deals.map((deal) => {
        return deal.adjustedPrice;
      }),
    ),
    ASSESSMENT_CONFIG.budgetTargetShare,
  );
  if (target === undefined || target <= context.criteria.maxPrice) {
    return [];
  }
  if (target > context.criteria.maxPrice * ASSESSMENT_CONFIG.maxBudgetRatio) {
    return [];
  }
  const candidate = makeCandidate(
    context,
    'raiseBudget',
    'raiseBudget',
    { newMaxPrice: target },
    computeFeasibility(pool, target),
  );
  if (candidate !== null) {
    candidate.facts.push({
      id: 'raiseBudget#budgetIncrease',
      key: 'budgetIncrease',
      value: target - context.criteria.maxPrice,
    });
  }
  return candidate === null ? [] : [candidate];
}

/** All compromises that improve feasibility, best first (by improvement, then pool size). */
export function findCompromises(
  market: PricedMarket,
  criteria: MarketCriteria,
  baseline: Feasibility,
): CompromiseCandidate[] {
  const context: Context = { deals: market.deals, market, criteria, baseline };
  return [
    ...dropFeatureCandidates(context),
    ...fewerRoomsCandidate(context),
    ...neighborhoodCandidates(context),
    ...nearbyCityCandidates(context),
    ...raiseBudgetCandidate(context),
  ].sort((a, b) => {
    return b.delta - a.delta || b.feasibility.poolSize - a.feasibility.poolSize;
  });
}
