import { describe, expect, it } from 'vitest';
import { computeFeasibility, confidenceFor } from '../../src/services/assessment/feasibility.js';
import { buildPool, evaluateDeal } from '../../src/services/assessment/pool.js';
import { createPriceAdjuster } from '../../src/services/assessment/priceAdjuster.js';
import { nearestRank } from '../../src/services/assessment/stats.js';
import { criteria, makeDeal, makePriced, withFeatures } from './builders.js';

describe('createPriceAdjuster', () => {
  const adjuster = createPriceAdjuster([
    { period: '2025-07-01', value: 500 },
    { period: '2026-07-01', value: 550 },
  ]);

  it('expresses prices in the latest index month', () => {
    const priced = adjuster.adjust(makeDeal({ dealDate: '2025-07-15', priceNis: 1_000_000 }));

    expect(adjuster.referencePeriod).toBe('2026-07-01');
    expect(priced.adjustedPrice).toBe(1_100_000);
    expect(priced.isAdjusted).toBe(true);
  });

  it('keeps the original price for an undated deal or an uncovered month', () => {
    expect(adjuster.adjust(makeDeal({ dealDate: null, priceNis: 900_000 }))).toMatchObject({
      adjustedPrice: 900_000,
      isAdjusted: false,
    });
    expect(adjuster.adjust(makeDeal({ dealDate: '2019-01-01', priceNis: 900_000 }))).toMatchObject({
      adjustedPrice: 900_000,
      isAdjusted: false,
    });
  });

  it('works without any index (nothing adjusted)', () => {
    const none = createPriceAdjuster([]);

    expect(none.referencePeriod).toBeNull();
    expect(none.adjust(makeDeal({ priceNis: 1 })).isAdjusted).toBe(false);
  });
});

describe('evaluateDeal / buildPool', () => {
  it('matches only the requested city', () => {
    expect(evaluateDeal(makePriced({ cityKey: 'haifa' }), criteria())).toBe('no');
  });

  it('accepts rooms within ±0.5', () => {
    const wants4 = criteria({ rooms: 4 });

    expect(evaluateDeal(makePriced({ rooms: 4.5 }), wants4)).toBe('match');
    expect(evaluateDeal(makePriced({ rooms: 3.5 }), wants4)).toBe('match');
    expect(evaluateDeal(makePriced({ rooms: 5 }), wants4)).toBe('no');
  });

  it('treats a required feature with unknown value as unknown, not as a match', () => {
    const wantsParking = criteria({ features: withFeatures({ parking: 'required' }) });
    const noParkingInfo = makePriced({
      features: { safeRoom: true, elevator: true, parking: null, balcony: true },
    });

    expect(evaluateDeal(noParkingInfo, wantsParking)).toBe('unknown');
  });

  it('a definite mismatch wins over missing data', () => {
    const wantsParkingAnd5Rooms = criteria({
      rooms: 5,
      features: withFeatures({ parking: 'required' }),
    });
    const deal = makePriced({
      rooms: 3,
      features: { safeRoom: true, elevator: true, parking: null, balcony: true },
    });

    expect(evaluateDeal(deal, wantsParkingAnd5Rooms)).toBe('no');
  });

  it('ignores preferred and "any" features when building the pool', () => {
    const prefers = criteria({ features: withFeatures({ safeRoom: 'preferred' }) });
    const withoutSafeRoom = makePriced({
      features: { safeRoom: false, elevator: true, parking: true, balcony: true },
    });

    expect(evaluateDeal(withoutSafeRoom, prefers)).toBe('match');
  });

  it('filters by neighborhood, size, floor, type and condition', () => {
    const strict = criteria({
      neighborhood: 'מרכז',
      minSizeSqm: 90,
      minFloor: 1,
      maxFloor: 5,
      propertyTypes: ['apartment'],
      conditions: ['good', 'renovated'],
    });

    expect(evaluateDeal(makePriced(), strict)).toBe('match');
    expect(evaluateDeal(makePriced({ neighborhood: 'אחר' }), strict)).toBe('no');
    expect(evaluateDeal(makePriced({ sizeSqm: 80 }), strict)).toBe('no');
    expect(evaluateDeal(makePriced({ floor: 7 }), strict)).toBe('no');
    expect(evaluateDeal(makePriced({ propertyType: 'penthouse' }), strict)).toBe('no');
    expect(evaluateDeal(makePriced({ condition: 'needsRenovation' }), strict)).toBe('no');
    expect(evaluateDeal(makePriced({ sizeSqm: null }), strict)).toBe('unknown');
  });

  it('collects the pool and counts unknowns separately', () => {
    const wantsSafeRoom = criteria({ features: withFeatures({ safeRoom: 'required' }) });
    const deals = [
      makePriced(),
      makePriced({ features: { safeRoom: null, elevator: true, parking: true, balcony: true } }),
      makePriced({ features: { safeRoom: false, elevator: true, parking: true, balcony: true } }),
      makePriced({ cityKey: 'haifa' }),
    ];

    const pool = buildPool(deals, wantsSafeRoom);

    expect(pool.deals).toHaveLength(1);
    expect(pool.unknownCount).toBe(1);
  });
});

describe('computeFeasibility', () => {
  const poolOf = (prices: number[]) => ({
    deals: prices.map((price) => makePriced({ priceNis: price })),
    unknownCount: 0,
  });

  it('is the share of the pool at or below the budget', () => {
    const result = computeFeasibility(
      poolOf([1_000_000, 2_000_000, 3_000_000, 4_000_000]),
      2_000_000,
    );

    expect(result).toMatchObject({
      matchRate: 0.5,
      poolSize: 4,
      affordableCount: 2,
      confidence: 'low',
    });
  });

  it('gives no percentage at all when the pool is too small', () => {
    const result = computeFeasibility(poolOf([1_000_000, 2_000_000]), 5_000_000);

    expect(result.matchRate).toBeNull();
    expect(result.confidence).toBe('insufficient');
  });

  it.each([
    [0, 'insufficient'],
    [2, 'insufficient'],
    [3, 'low'],
    [4, 'low'],
    [5, 'medium'],
    [14, 'medium'],
    [15, 'high'],
  ] as const)('pool of %d → %s confidence', (size, expected) => {
    expect(confidenceFor(size)).toBe(expected);
  });
});

describe('nearestRank', () => {
  it('returns values that exist in the data', () => {
    const sorted = [1, 2, 3, 4];

    expect(nearestRank(sorted, 0.25)).toBe(1);
    expect(nearestRank(sorted, 0.5)).toBe(2);
    expect(nearestRank(sorted, 0.75)).toBe(3);
    expect(nearestRank(sorted, 1)).toBe(4);
    expect(nearestRank([], 0.5)).toBeUndefined();
  });
});
