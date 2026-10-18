import { FEATURES, type MarketCriteria } from '@rel/shared';
import { ASSESSMENT_CONFIG } from './config.js';
import type { PricedDeal } from './types.js';

/** Everything that defines "the apartment I want" – i.e. the criteria without the budget. */
export type PoolCriteria = Omit<MarketCriteria, 'maxPrice'>;

export interface ComparablePool {
  deals: PricedDeal[];
  /** Deals that fail no requirement but miss data needed to confirm one (e.g. parking unknown). */
  unknownCount: number;
}

type Verdict = 'match' | 'unknown' | 'no';

function combine(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes('no')) {
    return 'no';
  }
  if (verdicts.includes('unknown')) {
    return 'unknown';
  }
  return 'match';
}

function checkKnown<T>(value: T | null, predicate: (known: T) => boolean): Verdict {
  if (value === null) {
    return 'unknown';
  }
  return predicate(value) ? 'match' : 'no';
}

export function evaluateDeal(deal: PricedDeal, criteria: PoolCriteria): Verdict {
  if (deal.cityKey !== criteria.cityKey) {
    return 'no';
  }
  const verdicts: Verdict[] = [];

  if (criteria.neighborhood !== undefined) {
    verdicts.push(checkKnown(deal.neighborhood, (name) => name === criteria.neighborhood));
  }
  if (criteria.rooms !== undefined) {
    const wanted = criteria.rooms;
    verdicts.push(
      Math.abs(deal.rooms - wanted) <= ASSESSMENT_CONFIG.roomsTolerance ? 'match' : 'no',
    );
  }
  if (criteria.propertyTypes !== undefined) {
    verdicts.push(criteria.propertyTypes.includes(deal.propertyType) ? 'match' : 'no');
  }
  if (criteria.conditions !== undefined) {
    const allowed = criteria.conditions;
    verdicts.push(checkKnown(deal.condition, (condition) => allowed.includes(condition)));
  }
  if (criteria.minSizeSqm !== undefined) {
    const minSize = criteria.minSizeSqm;
    verdicts.push(checkKnown(deal.sizeSqm, (size) => size >= minSize));
  }
  if (criteria.minFloor !== undefined) {
    const minFloor = criteria.minFloor;
    verdicts.push(checkKnown(deal.floor, (floor) => floor >= minFloor));
  }
  if (criteria.maxFloor !== undefined) {
    const maxFloor = criteria.maxFloor;
    verdicts.push(checkKnown(deal.floor, (floor) => floor <= maxFloor));
  }
  for (const feature of FEATURES) {
    if (criteria.features[feature] === 'required') {
      verdicts.push(checkKnown(deal.features[feature], (has) => has));
    }
  }
  return combine(verdicts);
}

/** Deals that match every hard requirement, regardless of price. */
export function buildPool(deals: readonly PricedDeal[], criteria: PoolCriteria): ComparablePool {
  const pool: PricedDeal[] = [];
  let unknownCount = 0;
  for (const deal of deals) {
    const verdict = evaluateDeal(deal, criteria);
    if (verdict === 'match') {
      pool.push(deal);
    } else if (verdict === 'unknown') {
      unknownCount++;
    }
  }
  return { deals: pool, unknownCount };
}
