import type { MarketCriteria } from '@rel/shared';
import { ASSESSMENT_CONFIG } from './config.js';
import { findCompromises, type CompromiseCandidate } from './compromises.js';
import { computeFeasibility, type Feasibility } from './feasibility.js';
import {
  houseParts,
  referenceDeals,
  typicalForBudget,
  type HousePart,
  type ReferenceDeal,
  type TypicalForBudget,
} from './insights.js';
import { buildPool } from './pool.js';
import type { PricedMarket } from './market.js';

export interface MarketAssessment {
  city: { key: string; nameHe: string };
  referencePeriod: string | null;
  feasibility: Feasibility;
  /** City-wide figure, shown when a chosen neighborhood has too few deals. */
  cityLevel: Feasibility | null;
  /** All improving compromises, best first; the UI shows the first few by default. */
  compromises: CompromiseCandidate[];
  typicalForBudget: TypicalForBudget | null;
  houseParts: HousePart[];
  referenceDeals: ReferenceDeal[];
}

export class UnknownCityError extends Error {
  constructor(readonly cityKey: string) {
    super(`Unknown city: ${cityKey}`);
    this.name = 'UnknownCityError';
  }
}

export function assess(market: PricedMarket, criteria: MarketCriteria): MarketAssessment {
  const city = market.cities.get(criteria.cityKey);
  if (city === undefined) {
    throw new UnknownCityError(criteria.cityKey);
  }

  const { maxPrice, ...poolCriteria } = criteria;
  const pool = buildPool(market.deals, poolCriteria);
  const feasibility = computeFeasibility(pool, maxPrice);

  let cityLevel: Feasibility | null = null;
  if (
    criteria.neighborhood !== undefined &&
    feasibility.poolSize < ASSESSMENT_CONFIG.cityLevelFallbackBelow
  ) {
    const { neighborhood: _neighborhood, ...cityWide } = poolCriteria;
    cityLevel = computeFeasibility(buildPool(market.deals, cityWide), maxPrice);
  }

  return {
    city: { key: city.key, nameHe: city.nameHe },
    referencePeriod: market.referencePeriod,
    feasibility,
    cityLevel,
    compromises: findCompromises(market, criteria, feasibility),
    typicalForBudget: typicalForBudget(market.deals, criteria),
    houseParts: houseParts(market.deals, criteria),
    referenceDeals: referenceDeals(pool.deals, criteria),
  };
}
