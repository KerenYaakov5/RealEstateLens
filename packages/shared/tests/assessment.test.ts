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

  it('keeps the longest possible request (100-letter Hebrew neighborhood) below the URL limit', () => {
    const longest = toAssessmentQueryString({
      cityId: 2_147_483_647,
      // Free text is the longest form: every Hebrew letter becomes 6 characters when encoded.
      neighborhood: 'ש'.repeat(100),
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

    expect(url.length).toBeLessThan(1200);
    expect(url.length).toBeLessThan(MAX_URL_LENGTH);
  });
});

describe('free-text neighborhood', () => {
  it('is accepted on its own but not together with a neighborhood id', () => {
    expect(
      parse(
        'cityId=1&maxPrice=3000000&neighborhood=%D7%A4%D7%9C%D7%95%D7%A8%D7%A0%D7%98%D7%99%D7%9F',
      ).success,
    ).toBe(true);
    expect(parse('cityId=1&maxPrice=3000000&neighborhood=x&neighborhoodId=4').success).toBe(false);
  });

  it('rejects text longer than 100 characters', () => {
    expect(parse(`cityId=1&maxPrice=3000000&neighborhood=${'a'.repeat(101)}`).success).toBe(false);
  });
});
