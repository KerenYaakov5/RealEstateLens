import { toAssessmentQueryString, type CityDto, type MarketAssessmentDto } from '@rel/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loginCookie, type TestApp } from './testApp.js';

let testApp: TestApp;
let cookie: string;
let holonId: number;

function get(query: string) {
  return request(testApp.app).get(`/api/v1/market-assessments?${query}`).set('cookie', cookie);
}

beforeAll(async () => {
  testApp = await createTestApp({ withSeedData: true });
  cookie = await loginCookie(testApp.app);
  const cities = (await request(testApp.app).get('/api/v1/cities').set('cookie', cookie)).body as {
    data: CityDto[];
  };
  holonId = cities.data.find((city) => city.name === 'חולון')?.id ?? 0;
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

describe('GET /api/v1/market-assessments', () => {
  it('requires a session', async () => {
    const res = await request(testApp.app).get(
      `/api/v1/market-assessments?cityId=${holonId}&maxPrice=2500000`,
    );

    expect(res.status).toBe(401);
  });

  it('returns a full assessment for one-digit feature codes', async () => {
    const res = await get(`cityId=${holonId}&maxPrice=2500000&rooms=3&parking=1&elevator=2`);
    const body = res.body as MarketAssessmentDto;

    expect(res.status).toBe(200);
    expect(body.city).toEqual({ id: holonId, name: 'חולון' });
    expect(body.houseParts.find((part) => part.part === 'parking')?.preference).toBe('required');
    expect(body.houseParts.find((part) => part.part === 'elevator')?.preference).toBe('preferred');
    expect(body.houseParts.find((part) => part.part === 'balcony')?.preference).toBe('any');
    expect(body.methodology.maxBudgetRatio).toBe(1.5);
    for (const deal of body.referenceDeals) {
      expect(deal.city.id).toBe(holonId);
      expect(deal.features.parking).toBe(true);
      expect(deal.adjustedPriceNis).toBeLessThanOrEqual(2_500_000);
    }
  });

  it('exposes numeric city ids in compromises, never internal keys', async () => {
    const res = await get(`cityId=${holonId}&maxPrice=1500000&rooms=4&safeRoom=1`);
    const body = res.body as MarketAssessmentDto;

    for (const compromise of body.compromises) {
      expect(compromise.params).not.toHaveProperty('cityKey');
      expect(compromise.facts.some((fact) => fact.key === 'cityKey')).toBe(false);
      if (compromise.type === 'nearbyCity') {
        expect(Number.isInteger(compromise.params.cityId)).toBe(true);
      }
    }
  });

  it('accepts the query built by the shared helper', async () => {
    const query = toAssessmentQueryString({
      cityId: holonId,
      maxPrice: 2_000_000,
      propertyType: ['apartment', 'gardenApartment'],
      features: { safeRoom: 'preferred' },
    });

    expect((await get(query)).status).toBe(200);
  });

  it.each([
    ['missing budget', () => `cityId=${holonId}`],
    ['feature code 3', () => `cityId=${holonId}&maxPrice=2000000&safeRoom=3`],
    ['feature code as word', () => `cityId=${holonId}&maxPrice=2000000&safeRoom=yes`],
    ['half-step rooms only', () => `cityId=${holonId}&maxPrice=2000000&rooms=3.3`],
    ['floors reversed', () => `cityId=${holonId}&maxPrice=2000000&minFloor=5&maxFloor=2`],
  ])('rejects %s with 400', async (_name, query) => {
    expect((await get(query())).status).toBe(400);
  });

  it('returns 404 for an unknown city or a neighborhood of another city', async () => {
    expect((await get('cityId=999999&maxPrice=2000000')).status).toBe(404);
    expect((await get(`cityId=${holonId}&maxPrice=2000000&neighborhoodId=999999`)).status).toBe(
      404,
    );
  });

  it('answers a repeated request from the result cache with the same body', async () => {
    const query = `cityId=${holonId}&maxPrice=2200000&rooms=4`;

    const first = await get(query);
    const second = await get(query);

    expect(second.body).toEqual(first.body);
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  it('rejects an over-long URL with 414', async () => {
    const res = await get(`cityId=${holonId}&maxPrice=2000000&pad=${'x'.repeat(2100)}`);

    expect(res.status).toBe(414);
    expect(res.body.error.code).toBe('URI_TOO_LONG');
  });

  it('tells the user when nothing matches and no single change helps', async () => {
    // Real data: 5 matching deals in Holon, none within 2.5M, and no compromise passes the rules.
    const none = (await get(`cityId=${holonId}&maxPrice=2500000&rooms=4&safeRoom=1&parking=1`))
      .body as MarketAssessmentDto;
    const some = (await get(`cityId=${holonId}&maxPrice=3000000&rooms=4&safeRoom=1&parking=1`))
      .body as MarketAssessmentDto;

    expect(none.compromises).toHaveLength(0);
    expect(none.notices.map((notice) => notice.code)).toContain('NO_ALTERNATIVES');
    expect(some.compromises.length).toBeGreaterThan(0);
    expect(some.notices.map((notice) => notice.code)).not.toContain('NO_ALTERNATIVES');
  });
});
