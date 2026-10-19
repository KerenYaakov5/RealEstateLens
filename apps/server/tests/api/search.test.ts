import type {
  CitySearchResultDto,
  MarketAssessmentDto,
  NeighborhoodSearchResultDto,
} from '@rel/shared';
import { and, isNotNull, isNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cities } from '../../src/db/schema.js';
import { createTestApp, loginCookie, type TestApp } from './testApp.js';

let testApp: TestApp;
let cookie: string;

function get(url: string) {
  return request(testApp.app).get(url).set('cookie', cookie);
}

async function searchCity(text: string): Promise<CitySearchResultDto[]> {
  const res = await get(`/api/v1/cities?search=${encodeURIComponent(text)}`);
  return res.status === 204 ? [] : (res.body as { data: CitySearchResultDto[] }).data;
}

async function cityIdOf(text: string): Promise<number> {
  const [first] = await searchCity(text);
  if (first === undefined) {
    throw new Error(`no city for ${text}`);
  }
  return first.id;
}

beforeAll(async () => {
  testApp = await createTestApp({ withSeedData: true });
  cookie = await loginCookie(testApp.app);
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

describe('GET /api/v1/cities?search=', () => {
  it.each([
    ['הרצ', 'הרצליה'],
    ['Herzlia', 'הרצליה'],
    ['herzliyya', 'הרצליה'],
    ['רמת גנ', 'רמת גן'],
    ['Tel אביב', 'תל אביב-יפו'],
    ['באר-שבע', 'באר שבע'],
    ['jerusalem', 'ירושלים'],
  ])('"%s" → %s first', async (text, expected) => {
    const [first] = await searchCity(text);

    expect(first?.name).toBe(expected);
  });

  it('finds localities we have no deals for, marked with dealCount 0', async () => {
    const [first] = await searchCity('ראש פינה');

    expect(first?.name).toBe('ראש פינה');
    expect(first?.dealCount).toBe(0);
  });

  it('ranks places with deals and larger municipalities first for a short prefix', async () => {
    const results = await searchCity('רמת');

    expect(results[0]?.name).toBe('רמת גן');
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('returns 204 when nothing matches', async () => {
    const res = await get(`/api/v1/cities?search=${encodeURIComponent('קסקסקס')}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('requires at least 3 characters', async () => {
    expect((await get(`/api/v1/cities?search=${encodeURIComponent('הר')}`)).status).toBe(400);
  });

  it('without search still lists only the 18 cities with deals', async () => {
    const res = await get('/api/v1/cities');

    expect((res.body as { data: unknown[] }).data).toHaveLength(18);
  });
});

describe('GET /api/v1/cities/:cityId/neighborhoods?search=', () => {
  it('finds a neighborhood by an English or abbreviated spelling', async () => {
    const telAviv = await cityIdOf('תל אביב');
    const res = await get(`/api/v1/cities/${telAviv}/neighborhoods?search=Florentin`);
    const names = (res.body as { data: NeighborhoodSearchResultDto[] }).data.map((n) => n.name);

    expect(names[0]).toBe('פלורנטין');
  });

  it('returns 204 when the city has no neighborhood by that name', async () => {
    const holon = await cityIdOf('חולון');

    expect(
      (await get(`/api/v1/cities/${holon}/neighborhoods?search=${encodeURIComponent('זזזזז')}`))
        .status,
    ).toBe(204);
  });

  it('returns 204 for a city without any neighborhoods in our data', async () => {
    const roshPinna = await cityIdOf('ראש פינה');

    expect((await get(`/api/v1/cities/${roshPinna}/neighborhoods`)).status).toBe(204);
  });
});

describe('GET /api/v1/market-assessments – when data is missing', () => {
  it('a city without deals: 200 with a notice and the nearest cities that have data', async () => {
    const roshPinna = await cityIdOf('ראש פינה');
    const res = await get(`/api/v1/market-assessments?cityId=${roshPinna}&maxPrice=2000000`);
    const body = res.body as MarketAssessmentDto;

    expect(res.status).toBe(200);
    expect(body.notices.map((notice) => notice.code)).toEqual(['CITY_NO_DATA']);
    expect(body.nearbyCitiesWithData.length).toBeGreaterThan(0);
    expect(body.nearbyCitiesWithData.every((city) => city.dealCount > 0)).toBe(true);
    const distances = body.nearbyCitiesWithData.map((city) => city.distanceKm);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('a city without deals and without official coordinates: 204', async () => {
    const [noLocation] = await testApp.handle.db
      .select({ id: cities.id })
      .from(cities)
      .where(and(isNotNull(cities.cbsCode), isNull(cities.itmX)))
      .limit(1);

    const res = await get(`/api/v1/market-assessments?cityId=${noLocation?.id}&maxPrice=2000000`);

    expect(res.status).toBe(204);
  });

  it('free-text neighborhood we have no deals for: city-wide results with a notice', async () => {
    const holon = await cityIdOf('חולון');
    const res = await get(
      `/api/v1/market-assessments?cityId=${holon}&maxPrice=2500000&neighborhood=${encodeURIComponent('שכונה שלא קיימת')}`,
    );
    const body = res.body as MarketAssessmentDto;

    expect(res.status).toBe(200);
    expect(body.neighborhood).toBeNull();
    expect(body.notices.map((notice) => notice.code)).toEqual(['NEIGHBORHOOD_NO_DATA']);
  });

  it('free-text neighborhood with a typo: matched, with a notice naming the neighborhood', async () => {
    const telAviv = await cityIdOf('תל אביב');
    const res = await get(
      `/api/v1/market-assessments?cityId=${telAviv}&maxPrice=5000000&neighborhood=Florentin`,
    );
    const body = res.body as MarketAssessmentDto;

    expect(body.neighborhood?.name).toBe('פלורנטין');
    expect(body.notices.map((notice) => notice.code)).toEqual(['NEIGHBORHOOD_MATCHED']);
  });

  it('a neighborhood picked from the list needs no notice', async () => {
    const holon = await cityIdOf('חולון');
    const list = await get(`/api/v1/cities/${holon}/neighborhoods`);
    const [first] = (list.body as { data: { id: number }[] }).data;

    const res = await get(
      `/api/v1/market-assessments?cityId=${holon}&maxPrice=2500000&neighborhoodId=${first?.id}`,
    );

    expect((res.body as MarketAssessmentDto).notices).toEqual([]);
  });

  it('rejects a neighborhood id and free text together', async () => {
    const holon = await cityIdOf('חולון');

    expect(
      (
        await get(
          `/api/v1/market-assessments?cityId=${holon}&maxPrice=2500000&neighborhoodId=1&neighborhood=x`,
        )
      ).status,
    ).toBe(400);
  });

  it('never adds free text to the neighborhood list', async () => {
    const holon = await cityIdOf('חולון');
    const before = await get(`/api/v1/cities/${holon}/neighborhoods`);
    await get(
      `/api/v1/market-assessments?cityId=${holon}&maxPrice=2500000&neighborhood=${encodeURIComponent('שכונה חדשה')}`,
    );
    const after = await get(`/api/v1/cities/${holon}/neighborhoods`);

    expect(after.body).toEqual(before.body);
  });
});
