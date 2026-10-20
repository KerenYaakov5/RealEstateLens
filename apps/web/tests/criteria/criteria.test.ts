import type { CompromiseDto } from '@rel/shared';
import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  criteriaReducer,
  DEFAULT_CRITERIA,
  parseStoredCriteria,
  roomsChoiceLabel,
  toRequest,
  type CriteriaState,
} from '../../src/features/criteria/criteria';

const HOLON = { id: 7, name: 'חולון' };
const withCity: CriteriaState = { ...DEFAULT_CRITERIA, city: HOLON };

function compromise(type: CompromiseDto['type'], params: CompromiseDto['params']): CompromiseDto {
  return {
    id: type,
    type,
    params,
    delta: 0.2,
    facts: [],
    feasibility: {
      matchRate: 0.4,
      poolSize: 10,
      affordableCount: 4,
      unknownCount: 0,
      confidence: 'medium',
    },
  };
}

const startingPoint: CriteriaState = {
  ...withCity,
  rooms: 4,
  neighborhood: { kind: 'list', id: 3, name: 'מרכז' },
  features: { ...withCity.features, safeRoom: 'required' },
};

function apply(type: CompromiseDto['type'], params: CompromiseDto['params']): CriteriaState {
  return criteriaReducer(startingPoint, {
    type: 'applyCompromise',
    compromise: compromise(type, params),
  });
}

describe('criteriaReducer', () => {
  it('clears the neighborhood when the city changes', () => {
    const state: CriteriaState = { ...withCity, neighborhood: { kind: 'text', text: 'מרכז' } };

    const next = criteriaReducer(state, { type: 'setCity', city: { id: 9, name: 'בת ים' } });

    expect(next.neighborhood).toBeNull();
  });

  it('keeps the budget inside the slider range', () => {
    expect(criteriaReducer(withCity, { type: 'setMaxPrice', maxPrice: 1 }).maxPrice).toBe(
      BUDGET.min,
    );
    expect(criteriaReducer(withCity, { type: 'setMaxPrice', maxPrice: 1e10 }).maxPrice).toBe(
      BUDGET.max,
    );
  });

  it('toggles property types on and off', () => {
    const on = criteriaReducer(withCity, { type: 'togglePropertyType', propertyType: 'penthouse' });
    const off = criteriaReducer(on, { type: 'togglePropertyType', propertyType: 'penthouse' });

    expect(on.propertyTypes).toEqual(['penthouse']);
    expect(off.propertyTypes).toEqual([]);
  });

  it('"הכל" clears every property type choice', () => {
    const some: CriteriaState = { ...withCity, propertyTypes: ['penthouse', 'duplex'] };

    expect(criteriaReducer(some, { type: 'clearPropertyTypes' }).propertyTypes).toEqual([]);
  });
});

describe('applying a compromise card', () => {
  it('drops a required feature', () => {
    expect(apply('dropFeature', { feature: 'safeRoom' }).features.safeRoom).toBe('any');
  });

  it('lowers the room count', () => {
    expect(apply('fewerRooms', { rooms: 3 }).rooms).toBe(3);
  });

  it('widens to the whole city', () => {
    expect(apply('anyNeighborhood', {}).neighborhood).toBeNull();
  });

  it('raises the budget', () => {
    expect(apply('raiseBudget', { newMaxPrice: 3_100_000 }).maxPrice).toBe(3_100_000);
  });

  it('moves to a nearby city and clears the neighborhood', () => {
    const next = apply('nearbyCity', { cityId: 9, cityName: 'בת ים', distanceKm: 2.8 });

    expect(next.city).toEqual({ id: 9, name: 'בת ים' });
    expect(next.neighborhood).toBeNull();
  });

  it('switches to another neighborhood by name', () => {
    expect(apply('otherNeighborhood', { neighborhood: 'נאות רחל' }).neighborhood).toEqual({
      kind: 'text',
      text: 'נאות רחל',
    });
  });
});

describe('toRequest', () => {
  it('is null until a city is chosen', () => {
    expect(toRequest(DEFAULT_CRITERIA)).toBeNull();
  });

  it('sends a picked neighborhood by id and free text as text', () => {
    expect(
      toRequest({ ...withCity, neighborhood: { kind: 'list', id: 3, name: 'מרכז' } }),
    ).toMatchObject({ neighborhoodId: 3 });
    expect(
      toRequest({ ...withCity, neighborhood: { kind: 'text', text: 'פלורנטין' } }),
    ).toMatchObject({ neighborhood: 'פלורנטין' });
  });

  it('sends the last rooms choice as "6 or more"', () => {
    expect(toRequest({ ...withCity, rooms: 4 })).toMatchObject({ rooms: 4 });
    const sixPlus = toRequest({ ...withCity, rooms: 6 });
    expect(sixPlus).toMatchObject({ minRooms: 6 });
    expect(sixPlus).not.toHaveProperty('rooms');
    expect(roomsChoiceLabel(6)).toBe('\u20666+\u2069');
    expect(roomsChoiceLabel(3)).toBe('3');
  });
});

describe('parseStoredCriteria', () => {
  it('restores valid stored choices', () => {
    expect(parseStoredCriteria(withCity)).toEqual(withCity);
  });

  it('falls back to defaults for missing or outdated data', () => {
    expect(parseStoredCriteria(undefined)).toEqual(DEFAULT_CRITERIA);
    expect(parseStoredCriteria({ city: 'Holon', budget: 'cheap' })).toEqual(DEFAULT_CRITERIA);
  });
});
