import type { CityDto, DealDto, NeighborhoodDto, Page } from '@rel/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loginCookie, type TestApp } from './testApp.js';

let testApp: TestApp;
let cookie: string;
let cities: CityDto[];

function get(url: string) {
  return request(testApp.app).get(url).set('cookie', cookie);
}

function cityId(name: string): number {
  const city = cities.find((item) => item.name === name);
  if (city === undefined) {
    throw new Error(`city ${name} missing`);
  }
  return city.id;
}

beforeAll(async () => {
  testApp = await createTestApp({ withSeedData: true });
  cookie = await loginCookie(testApp.app);
  cities = ((await get('/api/v1/cities')).body as { data: CityDto[] }).data;
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

describe('GET /api/v1/cities', () => {
  it('requires a session', async () => {
    expect((await request(testApp.app).get('/api/v1/cities')).status).toBe(401);
  });

  it('lists all 18 cities with numeric ids, deal counts and official location flags', () => {
    expect(cities).toHaveLength(18);
    expect(cities.reduce((sum, city) => sum + city.dealCount, 0)).toBe(518);
    expect(cities.every((city) => Number.isInteger(city.id) && city.hasOfficialLocation)).toBe(
      true,
    );
  });

  it('allows short private caching and conditional requests', async () => {
    const first = await get('/api/v1/cities');
    const second = await get('/api/v1/cities').set('if-none-match', String(first.headers.etag));

    expect(first.headers['cache-control']).toBe('private, max-age=60');
    expect(second.status).toBe(304);
  });
});

describe('GET /api/v1/cities/:cityId/neighborhoods', () => {
  it('lists the neighborhoods of a city', async () => {
    const res = await get(`/api/v1/cities/${cityId('בית שמש')}/neighborhoods`);
    const names = (res.body as { data: NeighborhoodDto[] }).data.map((item) => item.name);

    expect(res.status).toBe(200);
    expect(names).toContain("רמת בית שמש ג'");
  });

  it('returns 404 for an unknown city and 400 for a malformed id', async () => {
    expect((await get('/api/v1/cities/999999/neighborhoods')).status).toBe(404);
    expect((await get('/api/v1/cities/abc/neighborhoods')).status).toBe(400);
  });
});

describe('GET /api/v1/deals', () => {
  it('paginates with defaults and reports totals', async () => {
    const res = await get('/api/v1/deals');
    const body = res.body as Page<DealDto>;

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(20);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 518, totalPages: 26 });
  });

  it('filters with 0/1 flags and other optional filters', async () => {
    const id = cityId('חולון');
    const res = await get(
      `/api/v1/deals?cityId=${id}&hasParking=1&minRooms=3&maxRooms=4&pageSize=100`,
    );
    const deals = (res.body as Page<DealDto>).data;

    expect(deals.length).toBeGreaterThan(0);
    expect(deals.every((deal) => deal.city.id === id)).toBe(true);
    expect(deals.every((deal) => deal.features.parking === true)).toBe(true);
    expect(deals.every((deal) => deal.rooms >= 3 && deal.rooms <= 4)).toBe(true);
  });

  it('excludes deals whose value is unknown when that value is filtered', async () => {
    const res = await get('/api/v1/deals?hasParking=0&pageSize=100');

    expect((res.body as Page<DealDto>).data.every((deal) => deal.features.parking === false)).toBe(
      true,
    );
  });

  it('sorts by price ascending', async () => {
    const res = await get('/api/v1/deals?sortBy=price&sortOrder=asc&pageSize=50');
    const prices = (res.body as Page<DealDto>).data.map((deal) => deal.priceNis);

    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('returns an empty page for an unknown city filter', async () => {
    const res = await get('/api/v1/deals?cityId=999999');

    expect(res.status).toBe(200);
    expect((res.body as Page<DealDto>).meta.totalItems).toBe(0);
  });

  it('rejects invalid query values with 400', async () => {
    expect((await get('/api/v1/deals?hasParking=yes')).status).toBe(400);
    expect((await get('/api/v1/deals?pageSize=500')).status).toBe(400);
    expect((await get('/api/v1/deals?propertyType=castle')).status).toBe(400);
  });

  it('returns both the paid price and the adjusted price', async () => {
    const deal = ((await get('/api/v1/deals?pageSize=1')).body as Page<DealDto>).data[0];

    expect(deal).toHaveProperty('priceNis');
    expect(deal).toHaveProperty('adjustedPriceNis');
    expect(deal).toHaveProperty('isAdjusted');
  });
});
