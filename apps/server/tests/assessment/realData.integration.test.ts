import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, type MarketCriteria } from '@rel/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LocalitiesClient } from '../../src/clients/dataGov/localitiesClient.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { seedDeals } from '../../src/import/seedService.js';
import { logger } from '../../src/lib/logger.js';
import { CityRepository } from '../../src/repositories/city.repository.js';
import { DealRepository } from '../../src/repositories/deal.repository.js';
import { NeighborhoodRepository } from '../../src/repositories/neighborhood.repository.js';
import { PriceIndexRepository } from '../../src/repositories/priceIndex.repository.js';
import { assess } from '../../src/services/assessment/assess.js';
import type { PricedMarket } from '../../src/services/assessment/market.js';
import { ASSESSMENT_CONFIG } from '../../src/services/assessment/config.js';
import { LocalityService } from '../../src/services/locality.service.js';
import { MarketDataService } from '../../src/services/marketData.service.js';

// End to end on the real seed file, real CBS coordinates (committed snapshot) and a real
// slice of the CBS dwelling price index. Asserts guarantees, not specific numbers.
const seedFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/madlan-sample.xlsx',
);
const offlineClient = {
  fetchAll: () => Promise.reject(new Error('offline in tests')),
} as unknown as LocalitiesClient;

let handle: DatabaseHandle;
let marketData: MarketDataService;
let market: PricedMarket;
let dealRepository: DealRepository;

beforeAll(async () => {
  handle = createDatabase({ pgliteDataDir: 'memory://', logger });
  await handle.migrate();
  await seedDeals({ db: handle.db, filePath: seedFile, logger, today: new Date('2026-10-18') });
  const cityRepository = new CityRepository(handle.db);
  await new LocalityService(cityRepository, offlineClient, logger).ensureLocalities();
  const priceIndex = new PriceIndexRepository(handle.db);
  await priceIndex.upsertSeries(
    40010,
    [
      { year: 2026, month: 5, value: 593.0, baseDesc: 'Average 1993' },
      { year: 2026, month: 6, value: 593.6, baseDesc: 'Average 1993' },
      { year: 2026, month: 7, value: 590.0, baseDesc: 'Average 1993' },
    ],
    3,
  );
  dealRepository = new DealRepository(handle.db);
  marketData = new MarketDataService(
    {
      deals: dealRepository,
      cities: cityRepository,
      neighborhoods: new NeighborhoodRepository(handle.db),
      priceIndex,
    },
    logger,
  );
  market = await marketData.getMarket();
}, 120_000);

afterAll(async () => {
  await handle.close();
});

const scenarios: [string, MarketCriteria][] = [
  [
    'Ramat Gan, 4 rooms, safe room required, 3M',
    {
      cityKey: 'ramat-gan',
      maxPrice: 3_000_000,
      rooms: 4,
      features: { safeRoom: 'required', elevator: 'preferred', parking: 'any', balcony: 'any' },
    },
  ],
  [
    'Holon, 3 rooms, parking + elevator required, 2.5M',
    {
      cityKey: 'holon',
      maxPrice: 2_500_000,
      rooms: 3,
      features: { safeRoom: 'any', elevator: 'required', parking: 'required', balcony: 'any' },
    },
  ],
  [
    "Be'er Sheva, any apartment, 1.5M",
    {
      cityKey: 'beer-sheva',
      maxPrice: 1_500_000,
      features: { safeRoom: 'any', elevator: 'any', parking: 'any', balcony: 'any' },
    },
  ],
];

describe('in-memory market snapshot', () => {
  it('holds all 518 deals, every official locality, and coordinates for the 18 deal cities', () => {
    const dealCities = new Set(market.deals.map((deal) => deal.cityKey));

    expect(market.deals).toHaveLength(518);
    expect(market.cities.size).toBe(1484);
    expect(dealCities.size).toBe(18);
    expect([...dealCities].every((key) => market.cities.get(key)?.location !== null)).toBe(true);
    expect(market.referencePeriod).toBe('2026-07-01');
  });

  it('serves repeated reads from memory without touching the DB', async () => {
    const spy = vi.spyOn(dealRepository, 'findAllForSnapshot');

    await marketData.getMarket();
    await marketData.getMarket();

    expect(spy).not.toHaveBeenCalled();
  });
});

describe.each(scenarios)('assess on real data: %s', (_name, wanted) => {
  it('keeps every guarantee', () => {
    const result = assess(market, wanted);
    const { feasibility } = result;

    // Feasibility is a share of real deals, or nothing at all.
    if (feasibility.matchRate !== null) {
      expect(feasibility.matchRate).toBeGreaterThanOrEqual(0);
      expect(feasibility.matchRate).toBeLessThanOrEqual(1);
      expect(feasibility.poolSize).toBeGreaterThanOrEqual(
        ASSESSMENT_CONFIG.confidence.minPoolForRate,
      );
    }

    // Reference deals are real deals in the city, within budget, meeting every requirement.
    for (const deal of result.referenceDeals) {
      expect(deal.cityKey).toBe(wanted.cityKey);
      expect(deal.adjustedPrice).toBeLessThanOrEqual(wanted.maxPrice);
      for (const feature of FEATURES) {
        if (wanted.features[feature] === 'required') {
          expect(deal.features[feature]).toBe(true);
        }
      }
    }

    // Compromises rest on enough deals, improve things, and cite only computed values.
    for (const candidate of result.compromises) {
      expect(candidate.feasibility.poolSize).toBeGreaterThanOrEqual(
        ASSESSMENT_CONFIG.minCompromisePool,
      );
      expect(candidate.delta).toBeGreaterThan(0);
      const fact = (key: string) => candidate.facts.find((item) => item.key === key)?.value;
      expect(fact('matchRate')).toBe(candidate.feasibility.matchRate);
      expect(fact('poolSize')).toBe(candidate.feasibility.poolSize);
      if (candidate.type === 'nearbyCity') {
        expect(candidate.params.distanceKm).toBeLessThanOrEqual(ASSESSMENT_CONFIG.nearbyCityMaxKm);
      }
      if (candidate.type === 'raiseBudget') {
        const paid = market.deals.some(
          (deal) => deal.adjustedPrice === candidate.params.newMaxPrice,
        );
        expect(paid).toBe(true);
      }
    }

    // "What you can get" reports values that occur in real affordable deals.
    if (result.typicalForBudget !== null) {
      const roomsSeen = new Set(
        market.deals
          .filter(
            (deal) => deal.cityKey === wanted.cityKey && deal.adjustedPrice <= wanted.maxPrice,
          )
          .map((deal) => deal.rooms),
      );
      expect(roomsSeen.has(result.typicalForBudget.rooms.low)).toBe(true);
      expect(roomsSeen.has(result.typicalForBudget.rooms.high)).toBe(true);
    }
  });
});
