import { describe, expect, it } from 'vitest';
import { createPricedMarket } from '../../src/services/assessment/market.js';
import { neighborhoodKey, type SnapshotCity } from '../../src/services/assessment/types.js';
import { createDealMapper } from '../../src/services/marketQueries.js';
import { makePriced } from './builders.js';

const HOLON: SnapshotCity = {
  id: 7,
  key: 'holon',
  nameHe: 'חולון',
  nameEn: 'Holon',
  municipalStatus: 0,
  population: null,
  location: null,
};

function marketWith(deals: ReturnType<typeof makePriced>[]) {
  return createPricedMarket({
    deals,
    cities: new Map([['holon', HOLON]]),
    neighborhoods: [{ id: 40, cityKey: 'holon', name: 'מרכז' }],
    searchNames: new Map(),
    referencePeriod: null,
  });
}

describe('createPricedMarket', () => {
  it('derives lookups and deal counts once', () => {
    const market = marketWith([makePriced(), makePriced(), makePriced({ neighborhood: null })]);

    expect(market.indexes.citiesById.get(7)).toBe(HOLON);
    expect(market.indexes.neighborhoodsById.get(40)?.name).toBe('מרכז');
    expect(market.indexes.neighborhoodIdByKey.get(neighborhoodKey('holon', 'מרכז'))).toBe(40);
    expect(market.indexes.dealCountByCity.get('holon')).toBe(3);
    expect(market.indexes.dealCountByNeighborhood.get(neighborhoodKey('holon', 'מרכז'))).toBe(2);
  });
});

describe('createDealMapper', () => {
  it('maps ids from the snapshot', () => {
    const market = marketWith([makePriced()]);
    const deal = market.deals[0];
    if (deal === undefined) {
      throw new Error('missing deal');
    }

    const dto = createDealMapper(market)(deal);

    expect(dto.city).toEqual({ id: 7, name: 'חולון' });
    expect(dto.neighborhood).toEqual({ id: 40, name: 'מרכז' });
  });

  it('fails loudly instead of inventing a city for a deal', () => {
    const market = marketWith([]);

    expect(() => createDealMapper(market)(makePriced({ cityKey: 'atlantis' }))).toThrow(
      /unknown city/,
    );
  });
});
