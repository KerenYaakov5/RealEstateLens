import type { MarketCriteria } from '@rel/shared';
import type { PricedDeal, SnapshotDeal } from '../../src/services/assessment/types.js';

let counter = 0;

/** A deal with sensible defaults; override only what a test cares about. */
export function makeDeal(overrides: Partial<SnapshotDeal> = {}): SnapshotDeal {
  counter++;
  return {
    id: counter,
    dealId: `T${counter}`,
    cityKey: 'holon',
    neighborhood: 'מרכז',
    street: 'הרצל',
    propertyType: 'apartment',
    rooms: 4,
    sizeSqm: 100,
    floor: 2,
    totalFloors: 8,
    yearBuilt: 2000,
    condition: 'good',
    features: { safeRoom: true, elevator: true, parking: true, balcony: true },
    dealDate: '2026-07-01',
    priceNis: 2_000_000,
    source: 'taxAuthority',
    ...overrides,
  };
}

/** Same as makeDeal, already priced (adjusted price = original unless given). */
export function makePriced(
  overrides: Partial<SnapshotDeal> & { adjustedPrice?: number } = {},
): PricedDeal {
  const { adjustedPrice, ...rest } = overrides;
  const deal = makeDeal(rest);
  return { ...deal, adjustedPrice: adjustedPrice ?? deal.priceNis, isAdjusted: true };
}

export function criteria(overrides: Partial<MarketCriteria> = {}): MarketCriteria {
  return {
    cityKey: 'holon',
    maxPrice: 2_000_000,
    features: { safeRoom: 'any', elevator: 'any', parking: 'any', balcony: 'any' },
    ...overrides,
  };
}

export function withFeatures(
  features: Partial<MarketCriteria['features']>,
): MarketCriteria['features'] {
  return { safeRoom: 'any', elevator: 'any', parking: 'any', balcony: 'any', ...features };
}
