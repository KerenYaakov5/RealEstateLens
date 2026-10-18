import { describe, expect, it } from 'vitest';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { CityMatcher } from '../../src/import/normalizers/location.js';
import { mapRow, type RawRow } from '../../src/import/rowMapper.js';

const cities = new CityMatcher(CITY_REFERENCES);
const today = new Date('2026-10-18T00:00:00Z');

// Row D100350 from the seed file, as exceljs returns it.
const validRow: RawRow = {
  deal_id: 'D100350',
  city: 'ראשון לציון',
  neighborhood: 'נאות שקמה',
  street: 'לוי אשכול',
  property_type: 'בית פרטי',
  rooms: 3,
  size_sqm: 110,
  floor: 0,
  total_floors: 2,
  year_built: 1964,
  condition: 'דורש שיפוץ',
  has_elevator: false,
  has_parking: 'no',
  has_balcony: 'כן',
  has_safe_room: 'no',
  deal_date: new Date('2025-09-07T00:00:00Z'),
  price_nis: 3054000,
  price_per_sqm: 27764,
  source: 'רשות המסים',
};

describe('mapRow', () => {
  it('maps a valid row to a normalized deal', () => {
    const outcome = mapRow(validRow, 2, cities, today);

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.deal).toEqual({
      dealId: 'D100350',
      rowNumber: 2,
      cityKey: 'rishon-lezion',
      neighborhood: 'נאות שקמה',
      street: 'לוי אשכול',
      propertyType: 'privateHouse',
      rooms: 3,
      sizeSqm: 110,
      floor: 0,
      totalFloors: 2,
      yearBuilt: 1964,
      condition: 'needsRenovation',
      hasElevator: false,
      hasParking: false,
      hasBalcony: true,
      hasSafeRoom: false,
      dealDate: '2025-09-07',
      priceNis: 3054000,
      pricePerSqm: 27764,
      sourcePricePerSqm: 27764,
      source: 'taxAuthority',
    });
    expect(outcome.ok && outcome.warnings).toEqual([]);
  });

  it('stores unknown optional fields as null', () => {
    const outcome = mapRow(
      { ...validRow, size_sqm: '', floor: null, condition: '', has_parking: '', neighborhood: '' },
      3,
      cities,
      today,
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.deal.sizeSqm).toBeNull();
      expect(outcome.deal.pricePerSqm).toBeNull();
      expect(outcome.deal.floor).toBeNull();
      expect(outcome.deal.condition).toBeNull();
      expect(outcome.deal.hasParking).toBeNull();
      expect(outcome.deal.neighborhood).toBeNull();
    }
  });

  it('recomputes price per sqm and warns when the file disagrees', () => {
    const outcome = mapRow({ ...validRow, price_per_sqm: 0 }, 4, cities, today);

    expect(outcome.ok && outcome.deal.pricePerSqm).toBe(27764);
    expect(outcome.ok && outcome.warnings.join()).toMatch(/מחיר למ"ר/);
  });

  it('drops a floor above the building height with a warning', () => {
    const outcome = mapRow({ ...validRow, floor: 7, total_floors: 4 }, 5, cities, today);

    expect(outcome.ok && outcome.deal.floor).toBeNull();
    expect(outcome.ok && outcome.warnings.join()).toMatch(/גבוהה ממספר הקומות/);
  });

  it('rejects a row missing mandatory fields and reports every problem', () => {
    const outcome = mapRow(
      { ...validRow, city: 'עיר דמיונית', price_nis: '', source: 'שמועה' },
      6,
      cities,
      today,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.dealId).toBe('D100350');
      expect(outcome.errors).toHaveLength(3);
    }
  });
});
