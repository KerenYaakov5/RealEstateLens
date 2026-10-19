import { describe, expect, it } from 'vitest';
import {
  assessmentQuerySchema,
  MAX_URL_LENGTH,
  toAssessmentQueryString,
} from '../src/assessment.js';
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from '../src/enums.js';

function parse(query: string) {
  return assessmentQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(query)));
}

describe('feature codes', () => {
  it('maps one digit to a preference: 0 any, 1 required, 2 preferred', () => {
    const result = parse('cityId=1&maxPrice=3000000&safeRoom=1&elevator=2&parking=0');

    expect(result.success && result.data).toMatchObject({
      safeRoom: 'required',
      elevator: 'preferred',
      parking: 'any',
      balcony: 'any',
    });
  });

  it.each(['3', '11', 'yes', 'true', ''])('rejects feature value "%s"', (value) => {
    expect(parse(`cityId=1&maxPrice=3000000&safeRoom=${value}`).success).toBe(false);
  });
});

describe('toAssessmentQueryString', () => {
  it('omits defaults and uses one digit per feature', () => {
    const query = toAssessmentQueryString({
      cityId: 6,
      maxPrice: 3_000_000,
      rooms: 4,
      features: { safeRoom: 'required', elevator: 'preferred', parking: 'any' },
    });

    expect(query).toBe('cityId=6&maxPrice=3000000&rooms=4&safeRoom=1&elevator=2');
  });

  it('round-trips through the schema', () => {
    const query = toAssessmentQueryString({
      cityId: 6,
      neighborhoodId: 40,
      maxPrice: 2_500_000,
      propertyType: ['apartment', 'penthouse'],
      features: { balcony: 'required' },
    });

    const result = parse(query);

    expect(result.success && result.data).toMatchObject({
      cityId: 6,
      neighborhoodId: 40,
      maxPrice: 2_500_000,
      propertyType: ['apartment', 'penthouse'],
      balcony: 'required',
      safeRoom: 'any',
    });
  });

  it('keeps the longest possible request far below the URL limit', () => {
    const longest = toAssessmentQueryString({
      cityId: 2_147_483_647,
      neighborhoodId: 2_147_483_647,
      maxPrice: 2_147_483_647,
      rooms: 11.5,
      propertyType: Object.keys(PROPERTY_TYPES),
      condition: Object.keys(PROPERTY_CONDITIONS),
      minSize: 2_147_483_647,
      minFloor: -2_147_483_648,
      maxFloor: 2_147_483_647,
      features: {
        safeRoom: 'preferred',
        elevator: 'preferred',
        parking: 'preferred',
        balcony: 'preferred',
      },
    });
    const url = `/api/v1/market-assessments?${longest}`;

    expect(url.length).toBeLessThan(500);
    expect(url.length).toBeLessThan(MAX_URL_LENGTH);
  });
});
