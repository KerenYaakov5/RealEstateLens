import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { dedupeDeals, type DedupeResult } from '../../src/import/dedupe.js';
import { readSpreadsheet } from '../../src/import/excelReader.js';
import { CityMatcher } from '../../src/import/normalizers/location.js';
import { mapRow, type NormalizedDeal, type RowOutcome } from '../../src/import/rowMapper.js';

// Data contract: the real seed file must import cleanly. If the file changes, update these numbers
// deliberately – they document what we know about the data.
const seedFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/madlan-sample.xlsx',
);
const today = new Date('2026-10-18T00:00:00Z');

let outcomes: RowOutcome[];
let deduped: DedupeResult;

beforeAll(async () => {
  const rows = await readSpreadsheet(seedFile);
  const cities = new CityMatcher(CITY_REFERENCES);
  outcomes = rows.map((row) => {
    return mapRow(row.values, row.rowNumber, cities, today);
  });
  const valid = outcomes.flatMap((outcome) => {
    return outcome.ok ? [outcome.deal] : [];
  });
  deduped = dedupeDeals(valid);
});

describe('seed spreadsheet contract', () => {
  it('reads all 530 data rows', () => {
    expect(outcomes).toHaveLength(530);
  });

  it('rejects only the two rows with an impossible price', () => {
    const failures = outcomes.flatMap((outcome) => {
      return outcome.ok ? [] : [{ dealId: outcome.dealId, errors: outcome.errors }];
    });

    expect(failures).toEqual([
      { dealId: 'D100317', errors: [expect.stringMatching(/מחיר: 18000/)] },
      { dealId: 'D100251', errors: [expect.stringMatching(/מחיר: 0/)] },
    ]);
  });

  it('removes the 10 duplicate deal ids, leaving 518 deals', () => {
    expect(deduped.kept).toHaveLength(518);
    expect(deduped.rejected).toHaveLength(10);
  });

  it('keeps the later row for the conflicting duplicates (same date)', () => {
    const d100017 = deduped.kept.find((deal: NormalizedDeal) => {
      return deal.dealId === 'D100017';
    });

    expect(d100017?.priceNis).toBe(1851548);
  });

  it('resolves exactly 18 cities', () => {
    const cityKeys = new Set(
      deduped.kept.map((deal) => {
        return deal.cityKey;
      }),
    );

    expect(cityKeys.size).toBe(18);
  });

  it('keeps unknowns as null where the data has gaps', () => {
    const count = (predicate: (deal: NormalizedDeal) => boolean): number => {
      return deduped.kept.filter(predicate).length;
    };

    expect(count((deal) => deal.hasParking === null)).toBeGreaterThan(0);
    expect(count((deal) => deal.sizeSqm === null)).toBeGreaterThan(0);
    expect(count((deal) => deal.condition === null)).toBeGreaterThan(0);
    expect(count((deal) => deal.neighborhood === null)).toBeGreaterThan(0);
  });

  it('has a valid date for every deal', () => {
    expect(deduped.kept.every((deal) => deal.dealDate !== null)).toBe(true);
  });
});
