import { FEATURES, type Feature, type FeaturePreference, type MarketCriteria } from '@rel/shared';
import { ASSESSMENT_CONFIG } from './config.js';
import { computeFeasibility } from './feasibility.js';
import { buildPool, type PoolCriteria } from './pool.js';
import { nearestRank, sortedNumbers } from './stats.js';
import type { PricedDeal } from './types.js';

export interface ValueRange {
  low: number;
  high: number;
}

/** "For your budget in this city, most deals were …" – null when there are too few deals. */
export interface TypicalForBudget {
  dealCount: number;
  rooms: ValueRange;
  sizeSqm: ValueRange | null;
}

function range(values: readonly number[]): ValueRange | null {
  if (values.length < ASSESSMENT_CONFIG.typicalRange.minDeals) {
    return null;
  }
  const sorted = sortedNumbers(values);
  const low = nearestRank(sorted, ASSESSMENT_CONFIG.typicalRange.low);
  const high = nearestRank(sorted, ASSESSMENT_CONFIG.typicalRange.high);
  if (low === undefined || high === undefined) {
    return null;
  }
  return { low, high };
}

export function typicalForBudget(
  deals: readonly PricedDeal[],
  criteria: MarketCriteria,
): TypicalForBudget | null {
  const affordable = deals.filter((deal) => {
    return (
      deal.cityKey === criteria.cityKey &&
      deal.adjustedPrice <= criteria.maxPrice &&
      (criteria.propertyTypes === undefined || criteria.propertyTypes.includes(deal.propertyType))
    );
  });
  const rooms = range(
    affordable.map((deal) => {
      return deal.rooms;
    }),
  );
  if (rooms === null) {
    return null;
  }
  const sizes = affordable.flatMap((deal) => {
    return deal.sizeSqm === null ? [] : [deal.sizeSqm];
  });
  return { dealCount: affordable.length, rooms, sizeSqm: range(sizes) };
}

export interface ReferenceDeal extends PricedDeal {
  /** Preferred features this deal has – used to rank reference deals. */
  matchedPreferences: Feature[];
}

/** Real deals that fit the requirements and the budget, preferred features first, then newest. */
export function referenceDeals(
  pool: readonly PricedDeal[],
  criteria: MarketCriteria,
): ReferenceDeal[] {
  const preferred = FEATURES.filter((feature) => {
    return criteria.features[feature] === 'preferred';
  });
  return pool
    .filter((deal) => {
      return deal.adjustedPrice <= criteria.maxPrice;
    })
    .map((deal): ReferenceDeal => {
      return {
        ...deal,
        matchedPreferences: preferred.filter((feature) => {
          return deal.features[feature] === true;
        }),
      };
    })
    .sort((a, b) => {
      return (
        b.matchedPreferences.length - a.matchedPreferences.length ||
        (b.dealDate ?? '').localeCompare(a.dealDate ?? '')
      );
    })
    .slice(0, ASSESSMENT_CONFIG.maxReferenceDeals);
}

export type HousePartName = 'structure' | Feature;
export type HousePartStatus = 'full' | 'partial' | 'missing' | 'unknown';

export interface HousePart {
  part: HousePartName;
  preference: FeaturePreference | null;
  /** Share of affordable deals that have this part, or null when too few deals say. */
  share: number | null;
  knownCount: number;
  status: HousePartStatus;
}

function statusFor(share: number | null): HousePartStatus {
  if (share === null) {
    return 'unknown';
  }
  if (share >= ASSESSMENT_CONFIG.houseParts.fullFrom) {
    return 'full';
  }
  if (share >= ASSESSMENT_CONFIG.houseParts.partialFrom) {
    return 'partial';
  }
  return 'missing';
}

/**
 * The house visual. "structure" = how much of the market for the requested apartment
 * (ignoring yes/no features) is within budget. Each feature = share of those affordable
 * deals that have it, counting only deals where it is known.
 */
export function houseParts(deals: readonly PricedDeal[], criteria: MarketCriteria): HousePart[] {
  const { maxPrice, ...rest } = criteria;
  const structureOnly: PoolCriteria = {
    ...rest,
    features: { safeRoom: 'any', elevator: 'any', parking: 'any', balcony: 'any' },
  };
  const basePool = buildPool(deals, structureOnly);
  const structure = computeFeasibility(basePool, maxPrice);
  const affordable = basePool.deals.filter((deal) => {
    return deal.adjustedPrice <= maxPrice;
  });

  const parts: HousePart[] = [
    {
      part: 'structure',
      preference: null,
      share: structure.matchRate,
      knownCount: structure.poolSize,
      status: statusFor(structure.matchRate),
    },
  ];
  for (const feature of FEATURES) {
    const known = affordable.filter((deal) => {
      return deal.features[feature] !== null;
    });
    const withFeature = known.filter((deal) => {
      return deal.features[feature] === true;
    }).length;
    const share =
      known.length < ASSESSMENT_CONFIG.houseParts.minKnown ? null : withFeature / known.length;
    parts.push({
      part: feature,
      preference: criteria.features[feature],
      share,
      knownCount: known.length,
      status: statusFor(share),
    });
  }
  return parts;
}
