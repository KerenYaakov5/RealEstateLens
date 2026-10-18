import { describe, expect, it } from 'vitest';
import { dedupeDeals } from '../../src/import/dedupe.js';
import type { NormalizedDeal } from '../../src/import/rowMapper.js';

function deal(dealId: string, rowNumber: number, dealDate: string | null): NormalizedDeal {
  return {
    dealId,
    rowNumber,
    dealDate,
    cityKey: 'holon',
    neighborhood: null,
    street: 'הרצל',
    propertyType: 'apartment',
    rooms: 3,
    sizeSqm: 80,
    floor: 1,
    totalFloors: 4,
    yearBuilt: 1990,
    condition: null,
    hasElevator: true,
    hasParking: true,
    hasBalcony: true,
    hasSafeRoom: true,
    priceNis: 2_000_000 + rowNumber,
    pricePerSqm: 25_000,
    sourcePricePerSqm: null,
    source: 'broker',
  };
}

function keptRow(deals: NormalizedDeal[]): number | undefined {
  return dedupeDeals(deals).kept[0]?.rowNumber;
}

describe('dedupeDeals', () => {
  it('keeps unique deals untouched', () => {
    const result = dedupeDeals([deal('A', 2, '2025-01-01'), deal('B', 3, null)]);

    expect(result.kept).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('keeps the later date', () => {
    expect(keptRow([deal('A', 2, '2025-06-01'), deal('A', 9, '2024-01-01')])).toBe(2);
  });

  it('prefers a row with a valid date over one without', () => {
    expect(keptRow([deal('A', 2, '2024-01-01'), deal('A', 9, null)])).toBe(2);
    expect(keptRow([deal('A', 2, null), deal('A', 9, '2024-01-01')])).toBe(9);
  });

  it('falls back to the row that appears later in the file', () => {
    expect(keptRow([deal('A', 2, null), deal('A', 9, null)])).toBe(9);
    expect(keptRow([deal('A', 2, '2025-01-01'), deal('A', 9, '2025-01-01')])).toBe(9);
  });

  it('records why each duplicate was rejected', () => {
    const result = dedupeDeals([deal('A', 2, '2025-01-01'), deal('A', 9, '2025-01-01')]);

    expect(result.rejected).toEqual([
      expect.objectContaining({ keptRowNumber: 9, reason: expect.stringMatching(/כפילות/) }),
    ]);
    expect(result.rejected[0]?.deal.rowNumber).toBe(2);
  });
});
