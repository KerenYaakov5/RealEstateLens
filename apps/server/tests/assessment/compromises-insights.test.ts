import { describe, expect, it } from 'vitest';
import {
  assess,
  UnknownCityError,
  type PricedMarket,
} from '../../src/services/assessment/assess.js';
import { findCompromises } from '../../src/services/assessment/compromises.js';
import { computeFeasibility } from '../../src/services/assessment/feasibility.js';
import {
  houseParts,
  referenceDeals,
  typicalForBudget,
} from '../../src/services/assessment/insights.js';
import { buildPool } from '../../src/services/assessment/pool.js';
import type { PricedDeal, SnapshotCity } from '../../src/services/assessment/types.js';
import { criteria, makePriced, withFeatures } from './builders.js';

const NO_SAFE_ROOM = { safeRoom: false, elevator: true, parking: true, balcony: true } as const;

// Official CBS coordinates (ITM meters) for the cities used here.
const CITIES = new Map<string, SnapshotCity>([
  ['holon', { key: 'holon', nameHe: 'חולון', location: { x: 179253, y: 658225 } }],
  ['bat-yam', { key: 'bat-yam', nameHe: 'בת ים', location: { x: 176515, y: 658597 } }],
  ['beer-sheva', { key: 'beer-sheva', nameHe: 'באר שבע', location: { x: 179500, y: 573657 } }],
  ['no-coords', { key: 'no-coords', nameHe: 'ללא מיקום', location: null }],
]);

function compromisesFor(deals: PricedDeal[], wanted = criteria()) {
  const { maxPrice, ...rest } = wanted;
  const baseline = computeFeasibility(buildPool(deals, rest), maxPrice);
  return findCompromises(deals, CITIES, wanted, baseline);
}

function times(n: number, make: (i: number) => PricedDeal): PricedDeal[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

describe('findCompromises', () => {
  it('offers dropping a required feature when that makes more deals affordable', () => {
    const deals = [
      ...times(3, () => makePriced({ priceNis: 3_000_000 })),
      ...times(3, () => makePriced({ priceNis: 1_500_000, features: NO_SAFE_ROOM })),
    ];
    const wanted = criteria({ features: withFeatures({ safeRoom: 'required' }) });

    const candidates = compromisesFor(deals, wanted);
    const dropSafeRoom = candidates.find((candidate) => candidate.id === 'dropFeature:safeRoom');

    expect(dropSafeRoom?.feasibility.matchRate).toBe(0.5);
    expect(dropSafeRoom?.delta).toBe(0.5);
  });

  it('ranks by improvement: a budget that buys every matching deal beats a 50% gain', () => {
    const deals = [
      ...times(3, () => makePriced({ priceNis: 3_000_000 })),
      ...times(3, () => makePriced({ priceNis: 1_500_000, features: NO_SAFE_ROOM })),
    ];
    const wanted = criteria({ features: withFeatures({ safeRoom: 'required' }) });

    const ids = compromisesFor(deals, wanted).map((candidate) => candidate.id);

    expect(ids).toEqual(['raiseBudget', 'dropFeature:safeRoom']);
  });

  it('offers raising the budget to a price that was actually paid', () => {
    const deals = [1_800_000, 2_100_000, 2_400_000, 2_700_000].map((price) => {
      return makePriced({ priceNis: price });
    });

    const raise = compromisesFor(deals, criteria({ maxPrice: 1_900_000 })).find(
      (candidate) => candidate.type === 'raiseBudget',
    );

    expect(raise?.params.newMaxPrice).toBe(2_100_000);
    expect(raise?.feasibility.matchRate).toBe(0.5);
    expect(raise?.facts).toContainEqual({
      id: 'raiseBudget#budgetIncrease',
      key: 'budgetIncrease',
      value: 200_000,
    });
  });

  it('offers a nearby city only within the distance limit, with its official distance', () => {
    const deals = [
      ...times(3, () => makePriced({ priceNis: 3_000_000 })),
      ...times(3, () => makePriced({ cityKey: 'bat-yam', priceNis: 1_500_000 })),
      ...times(3, () => makePriced({ cityKey: 'beer-sheva', priceNis: 900_000 })),
      ...times(3, () => makePriced({ cityKey: 'no-coords', priceNis: 900_000 })),
    ];

    const cityCards = compromisesFor(deals).filter((candidate) => candidate.type === 'nearbyCity');

    expect(cityCards.map((card) => card.params.cityKey)).toEqual(['bat-yam']);
    expect(cityCards[0]?.params.distanceKm).toBe(2.8);
  });

  it('offers one room fewer and the best other neighborhood', () => {
    const deals = [
      ...times(3, () => makePriced({ rooms: 4, priceNis: 3_000_000 })),
      ...times(3, () => makePriced({ rooms: 3, priceNis: 1_500_000 })),
      ...times(3, () => makePriced({ rooms: 4, neighborhood: 'נאות רחל', priceNis: 1_500_000 })),
    ];
    const wanted = criteria({ rooms: 4, neighborhood: 'מרכז' });

    const ids = compromisesFor(deals, wanted).map((candidate) => candidate.id);

    expect(ids).toContain('fewerRooms');
    expect(ids).toContain('otherNeighborhood:נאות רחל');
    expect(ids).toContain('anyNeighborhood');
  });

  it('drops compromises that rest on fewer than 3 deals or do not help', () => {
    const deals = [
      ...times(3, () => makePriced({ priceNis: 1_000_000 })),
      ...times(2, () => makePriced({ cityKey: 'bat-yam', priceNis: 900_000 })),
    ];

    expect(compromisesFor(deals)).toEqual([]);
  });

  it('every fact has a unique id and comes from the computation', () => {
    const deals = [
      ...times(3, () => makePriced({ priceNis: 3_000_000 })),
      ...times(3, () => makePriced({ priceNis: 1_500_000, features: NO_SAFE_ROOM })),
    ];
    const candidates = compromisesFor(
      deals,
      criteria({ features: withFeatures({ safeRoom: 'required' }) }),
    );
    const ids = candidates.flatMap((candidate) => candidate.facts.map((fact) => fact.id));

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('typicalForBudget', () => {
  it('describes what the budget bought in the city, using real values only', () => {
    const deals = [
      makePriced({ rooms: 3, sizeSqm: 70, priceNis: 1_500_000 }),
      makePriced({ rooms: 3.5, sizeSqm: 80, priceNis: 1_600_000 }),
      makePriced({ rooms: 4, sizeSqm: 95, priceNis: 1_700_000 }),
      makePriced({ rooms: 5, sizeSqm: 140, priceNis: 4_000_000 }),
    ];

    expect(typicalForBudget(deals, criteria({ maxPrice: 1_800_000 }))).toEqual({
      dealCount: 3,
      rooms: { low: 3, high: 4 },
      sizeSqm: { low: 70, high: 95 },
    });
  });

  it('says nothing when fewer than 3 deals fit the budget', () => {
    const deals = [makePriced({ priceNis: 1_000_000 }), makePriced({ priceNis: 9_000_000 })];

    expect(typicalForBudget(deals, criteria())).toBeNull();
  });
});

describe('referenceDeals', () => {
  it('lists affordable pool deals, preferred features first, then newest', () => {
    const older = makePriced({ dealDate: '2024-01-01' });
    const newer = makePriced({ dealDate: '2026-01-01', features: NO_SAFE_ROOM });
    const tooExpensive = makePriced({ priceNis: 9_000_000 });
    const wanted = criteria({ features: withFeatures({ safeRoom: 'preferred' }) });

    const result = referenceDeals([newer, older, tooExpensive], wanted);

    expect(result.map((deal) => deal.dealId)).toEqual([older.dealId, newer.dealId]);
    expect(result[0]?.matchedPreferences).toEqual(['safeRoom']);
  });
});

describe('houseParts', () => {
  it('marks each part by the share of affordable deals that have it', () => {
    const deals = [
      ...times(4, () => makePriced({ priceNis: 1_500_000 })),
      ...times(1, () => makePriced({ priceNis: 1_500_000, features: NO_SAFE_ROOM })),
      ...times(5, () => makePriced({ priceNis: 3_000_000 })),
    ];

    const parts = houseParts(deals, criteria({ features: withFeatures({ safeRoom: 'required' }) }));

    expect(parts.find((part) => part.part === 'structure')).toMatchObject({
      share: 0.5,
      status: 'full',
    });
    expect(parts.find((part) => part.part === 'safeRoom')).toMatchObject({
      share: 0.8,
      status: 'full',
      preference: 'required',
    });
  });

  it('reports unknown when too few affordable deals have the value', () => {
    const unknownParking = { safeRoom: true, elevator: true, parking: null, balcony: true };
    const deals = times(4, () => makePriced({ priceNis: 1_000_000, features: unknownParking }));

    const parking = houseParts(deals, criteria()).find((part) => part.part === 'parking');

    expect(parking).toMatchObject({ share: null, status: 'unknown', knownCount: 0 });
  });
});

describe('assess', () => {
  const market: PricedMarket = {
    deals: times(6, (i) => makePriced({ priceNis: 1_500_000 + i * 200_000 })),
    cities: CITIES,
    referencePeriod: '2026-07-01',
  };

  it('returns the full assessment for a city', () => {
    const result = assess(market, criteria({ maxPrice: 2_000_000 }));

    expect(result.city).toEqual({ key: 'holon', nameHe: 'חולון' });
    expect(result.feasibility).toMatchObject({ poolSize: 6, affordableCount: 3, matchRate: 0.5 });
    expect(result.referencePeriod).toBe('2026-07-01');
    expect(result.cityLevel).toBeNull();
    expect(result.houseParts).toHaveLength(5);
    expect(result.referenceDeals).toHaveLength(3);
  });

  it('adds a city-wide figure when the chosen neighborhood has too few deals', () => {
    const result = assess(market, criteria({ neighborhood: 'שכונה קטנה' }));

    expect(result.feasibility.confidence).toBe('insufficient');
    expect(result.cityLevel?.poolSize).toBe(6);
  });

  it('rejects an unknown city', () => {
    expect(() => assess(market, criteria({ cityKey: 'atlantis' }))).toThrow(UnknownCityError);
  });
});
