import {
  PRIORITY_LABELS,
  priorityKeyOf,
  type CityDto,
  type MarketAssessmentDto,
  type PriorityKey,
  type RecommendationDto,
} from '@rel/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LlmRequest, LlmResponse } from '../../src/clients/llm/types.js';
import { FakeProvider } from '../recommendation/builders.js';
import { createTestApp, loginCookie, type TestApp } from './testApp.js';

interface SentInput {
  p: Partial<Record<PriorityKey, number>>;
  c: { id: string; give: PriorityKey; rate: number }[];
}

/** A well-behaved model: picks the candidate whose requirement the user rated lowest. */
async function groundedModel(llmRequest: LlmRequest): Promise<LlmResponse> {
  const input = JSON.parse(llmRequest.messages[0]?.text ?? '{}') as SentInput;
  const rated = input.c.filter((candidate) => input.p[candidate.give] !== undefined);
  rated.sort((a, b) => (input.p[a.give] ?? 0) - (input.p[b.give] ?? 0));
  const best = rated[0];
  if (best === undefined) {
    throw new Error('test model got nothing to pick');
  }
  const rating = input.p[best.give] ?? 0;
  const why = `דירגת את ${PRIORITY_LABELS[best.give]} בחשיבות ${rating}, ועם הוויתור ${best.rate}% מהעסקאות בתקציב.`;
  return Promise.resolve({
    text: JSON.stringify({ picks: [{ id: best.id, why, facts: ['rate'], pri: [best.give] }] }),
    inputTokens: 150,
    outputTokens: 50,
  });
}

let testApp: TestApp;
let cookie: string;
let provider: FakeProvider;
interface Criteria {
  cityId: number;
  maxPrice: number;
  rooms: number;
  features: { safeRoom: 'required'; parking: 'required' };
}
let criteria: Criteria;
let assessment: MarketAssessmentDto;

function post(body: unknown, withCookie = true) {
  const req = request(testApp.app).post('/api/v1/compromise-recommendations');
  return (withCookie ? req.set('cookie', cookie) : req).send(body as object);
}

beforeAll(async () => {
  provider = new FakeProvider('gemini', [groundedModel]);
  testApp = await createTestApp({
    withSeedData: true,
    llmProviders: [provider],
    recommendationOptions: { dailyQuota: 2 },
  });
  cookie = await loginCookie(testApp.app);
  const cities = (await request(testApp.app).get('/api/v1/cities').set('cookie', cookie)).body as {
    data: CityDto[];
  };
  const holonId = cities.data.find((city) => city.name === 'חולון')?.id ?? 0;
  // The first budget at which the real data offers several compromises.
  for (const maxPrice of [1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000]) {
    const res = await request(testApp.app)
      .get(
        `/api/v1/market-assessments?cityId=${holonId}&maxPrice=${maxPrice}&rooms=4&safeRoom=1&parking=1`,
      )
      .set('cookie', cookie);
    assessment = res.body as MarketAssessmentDto;
    criteria = {
      cityId: holonId,
      maxPrice,
      rooms: 4,
      features: { safeRoom: 'required', parking: 'required' },
    };
    if (assessment.compromises.length >= 3) {
      break;
    }
  }
}, 120_000);

afterAll(async () => {
  await testApp.close();
});

describe('POST /api/v1/compromise-recommendations', () => {
  it('requires a session', async () => {
    const res = await post({ criteria, priorities: {} }, false);

    expect(res.status).toBe(401);
  });

  it('validates the body with the same rules as the assessment', async () => {
    expect((await post({ criteria, priorities: { safeRoom: 9 } })).status).toBe(400);
    expect((await post({ criteria: { ...criteria, rooms: 0.3 }, priorities: {} })).status).toBe(
      400,
    );
    expect(
      (await post({ criteria: { ...criteria, cityId: 999_999 }, priorities: {} })).status,
    ).toBe(404);
  });

  it('picks among the compromises the server computed itself, then serves the cache', async () => {
    expect(assessment.compromises.length).toBeGreaterThanOrEqual(3);
    const priorities = { safeRoom: 5, parking: 3, budget: 1, rooms: 4, city: 3, neighborhood: 2 };

    const first = await post({ criteria, priorities });
    const body = first.body as RecommendationDto;

    expect(first.status).toBe(200);
    expect(body.source).toBe('llm');
    expect(body.aiQuotaLeft).toBe(1);
    const ids = new Set(assessment.compromises.map((compromise) => compromise.id));
    for (const pick of body.picks) {
      expect(ids.has(pick.compromiseId)).toBe(true);
    }

    const again = await post({ criteria, priorities });
    expect((again.body as RecommendationDto).source).toBe('cache');
    expect(provider.calls).toHaveLength(1);
  });

  it('returns 429 when the daily quota is used up, and /users/me shows 0 left', async () => {
    // Vary a rating that matters (the best compromise's), so neither request is a cache hit.
    const relevant = priorityKeyOf(
      assessment.compromises[0] as MarketAssessmentDto['compromises'][number],
    );
    const all = { safeRoom: 4, parking: 4, budget: 4, rooms: 4, city: 4, neighborhood: 4 };
    expect((await post({ criteria, priorities: { ...all, [relevant]: 1 } })).status).toBe(200);

    const res = await post({ criteria, priorities: { ...all, [relevant]: 2 } });
    expect(res.status).toBe(429);
    expect((res.body as { error: { code: string } }).error.code).toBe('AI_QUOTA_EXCEEDED');

    const me = await request(testApp.app).get('/api/v1/users/me').set('cookie', cookie);
    expect(me.body).toEqual({ email: 'tester@example.com', isAdmin: false, aiQuotaLeft: 0 });
  });

  it('answers automatically (no model, no quota) when there is nothing to personalize', async () => {
    const res = await post({ criteria, priorities: {} });

    expect(res.status).toBe(200);
    expect((res.body as RecommendationDto).source).toBe('fallback');
  });
});
