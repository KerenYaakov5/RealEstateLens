import { beforeEach, describe, expect, it } from 'vitest';
import { LlmUnavailableError, type LlmProvider } from '../../src/clients/llm/types.js';
import type { AppError } from '../../src/errors/AppError.js';
import { logger } from '../../src/lib/logger.js';
import type { AiCacheRepository, CachedAnswer } from '../../src/repositories/aiCache.repository.js';
import type {
  AiUsageRepository,
  UsageIncrement,
} from '../../src/repositories/aiUsage.repository.js';
import {
  CompromiseRecommendationService,
  israelDay,
  type RecommendationOptions,
} from '../../src/services/recommendation/recommendation.service.js';
import { COMPROMISES, FakeProvider, GOOD_ANSWER } from './builders.js';

const PRIORITIES = { budget: 3, parking: 1, rooms: 5 };
const USER = 7;
const unavailable = (provider: string) => new LlmUnavailableError('HTTP 503', provider, 503);

class MemoryCacheRepo {
  readonly rows = new Map<string, CachedAnswer>();
  get(key: string) {
    return Promise.resolve(this.rows.get(key));
  }
  set(key: string, _version: number, answer: CachedAnswer) {
    this.rows.set(key, answer);
    return Promise.resolve();
  }
}

class MemoryUsageRepo {
  readonly totals = new Map<string, UsageIncrement>();
  llmCallsOn(day: string) {
    let calls = 0;
    for (const [key, value] of this.totals) {
      if (key.endsWith(`|${day}`)) {
        calls += value.llmCalls;
      }
    }
    return Promise.resolve(calls);
  }
  recommendationsOn(userId: number, day: string) {
    return Promise.resolve(this.totals.get(`${userId}|${day}`)?.recommendations ?? 0);
  }
  add(userId: number, day: string, increment: UsageIncrement) {
    const key = `${userId}|${day}`;
    const current = this.totals.get(key) ?? {
      recommendations: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    this.totals.set(key, {
      recommendations: current.recommendations + increment.recommendations,
      llmCalls: current.llmCalls + increment.llmCalls,
      inputTokens: current.inputTokens + increment.inputTokens,
      outputTokens: current.outputTokens + increment.outputTokens,
    });
    return Promise.resolve();
  }
  today(userId = USER) {
    return this.totals.get(`${userId}|${israelDay(Date.now())}`);
  }
}

let cache: MemoryCacheRepo;
let usage: MemoryUsageRepo;

function service(providers: LlmProvider[], options: Partial<RecommendationOptions> = {}) {
  return new CompromiseRecommendationService({
    providers,
    cache: cache as unknown as AiCacheRepository,
    usage: usage as unknown as AiUsageRepository,
    logger,
    options: {
      enabled: true,
      dailyQuota: 2,
      dailyCallLimit: 100,
      timeoutMs: 1000,
      maxOutputTokens: 300,
      ...options,
    },
  });
}

beforeEach(() => {
  cache = new MemoryCacheRepo();
  usage = new MemoryUsageRepo();
});

describe('CompromiseRecommendationService', () => {
  it('returns validated model picks, stores them and charges one quota unit', async () => {
    const gemini = new FakeProvider('gemini', [GOOD_ANSWER]);

    const result = await service([gemini]).recommend(USER, COMPROMISES, PRIORITIES);

    expect(result.source).toBe('llm');
    expect(result.picks.map((pick) => pick.compromiseId)).toEqual([
      'dropFeature:parking',
      'raiseBudget',
    ]);
    expect(result.aiQuotaLeft).toBe(1);
    expect(cache.rows.size).toBe(1);
    expect(usage.today()).toEqual({
      recommendations: 1,
      llmCalls: 1,
      inputTokens: 100,
      outputTokens: 40,
    });
  });

  it('serves a repeated question from cache without calling the model or using quota', async () => {
    const gemini = new FakeProvider('gemini', [GOOD_ANSWER]);
    const recommendations = service([gemini]);
    await recommendations.recommend(USER, COMPROMISES, PRIORITIES);

    // Same relevant priorities; "city" is irrelevant (no nearby-city candidate).
    const again = await recommendations.recommend(USER, COMPROMISES, { ...PRIORITIES, city: 5 });

    expect(again.source).toBe('cache');
    expect(gemini.calls).toHaveLength(1);
    expect(usage.today()?.recommendations).toBe(1);
  });

  it('uses the database cache after a restart (new memory)', async () => {
    await service([new FakeProvider('gemini', [GOOD_ANSWER])]).recommend(
      USER,
      COMPROMISES,
      PRIORITIES,
    );
    const fresh = new FakeProvider('gemini', [GOOD_ANSWER]);

    const result = await service([fresh]).recommend(USER, COMPROMISES, PRIORITIES);

    expect(result.source).toBe('cache');
    expect(fresh.calls).toHaveLength(0);
  });

  it('throws 429 when the quota is used up – but cache hits still work', async () => {
    const recommendations = service([new FakeProvider('gemini', [GOOD_ANSWER])], { dailyQuota: 1 });
    await recommendations.recommend(USER, COMPROMISES, PRIORITIES);

    await expect(
      recommendations.recommend(USER, COMPROMISES, { ...PRIORITIES, parking: 4 }),
    ).rejects.toMatchObject({ status: 429, code: 'AI_QUOTA_EXCEEDED' } satisfies Partial<AppError>);
    await expect(recommendations.recommend(USER, COMPROMISES, PRIORITIES)).resolves.toMatchObject({
      source: 'cache',
      aiQuotaLeft: 0,
    });
  });

  it('wrong answer → one repair attempt with the errors → success', async () => {
    const invented = JSON.stringify({
      picks: [
        { id: 'c2', why: 'החניה בחשיבות 1, ו-77% נמכרו.', facts: ['rate'], pri: ['parking'] },
      ],
    });
    const gemini = new FakeProvider('gemini', [invented, GOOD_ANSWER]);

    const result = await service([gemini]).recommend(USER, COMPROMISES, PRIORITIES);

    expect(result.source).toBe('llm');
    expect(gemini.calls).toHaveLength(2);
    expect(gemini.calls[1]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(gemini.calls[1]?.messages[2]?.text).toContain('77');
  });

  it('wrong answer twice → automatic recommendation, nothing cached, no quota used', async () => {
    const gemini = new FakeProvider('gemini', ['not json']);
    const openai = new FakeProvider('openai', [GOOD_ANSWER]);

    const result = await service([gemini, openai]).recommend(USER, COMPROMISES, PRIORITIES);

    expect(result.source).toBe('fallback');
    expect(result.picks[0]?.compromiseId).toBe('dropFeature:parking');
    expect(gemini.calls).toHaveLength(2);
    expect(openai.calls).toHaveLength(0);
    expect(cache.rows.size).toBe(0);
    expect(usage.today()?.recommendations).toBe(0);
    expect(usage.today()?.llmCalls).toBe(2);
  });

  it('unavailable provider → second provider', async () => {
    const gemini = new FakeProvider('gemini', [unavailable('gemini')]);
    const openai = new FakeProvider('openai', [GOOD_ANSWER]);

    const result = await service([gemini, openai]).recommend(USER, COMPROMISES, PRIORITIES);

    expect(result.source).toBe('llm');
    expect(openai.calls).toHaveLength(1);
  });

  it('slow providers (timeout) → automatic recommendation', async () => {
    const timeout = (provider: string) => new LlmUnavailableError('timeout after 1000ms', provider);
    const result = await service([
      new FakeProvider('gemini', [timeout('gemini')]),
      new FakeProvider('openai', [timeout('openai')]),
    ]).recommend(USER, COMPROMISES, PRIORITIES);

    expect(result.source).toBe('fallback');
    expect(result.aiQuotaLeft).toBe(2);
  });

  it('skips a provider whose circuit is open', async () => {
    const gemini = new FakeProvider('gemini', [unavailable('gemini')]);
    const openai = new FakeProvider('openai', [GOOD_ANSWER]);
    const recommendations = service([gemini, openai], { dailyQuota: 10 });
    // A different rooms rating each time, so no answer comes from the cache.
    for (const rooms of [1, 2, 3]) {
      await recommendations.recommend(USER, COMPROMISES, { ...PRIORITIES, rooms });
    }

    await recommendations.recommend(USER, COMPROMISES, { ...PRIORITIES, rooms: 4 });

    expect(gemini.calls).toHaveLength(3);
    expect(openai.calls).toHaveLength(4);
  });

  it('kill switch, no providers, or nothing to choose → automatic, no model call', async () => {
    const gemini = new FakeProvider('gemini', [GOOD_ANSWER]);

    const disabled = await service([gemini], { enabled: false }).recommend(
      USER,
      COMPROMISES,
      PRIORITIES,
    );
    const none = await service([]).recommend(USER, COMPROMISES, PRIORITIES);
    const single = await service([gemini]).recommend(USER, COMPROMISES.slice(0, 1), PRIORITIES);
    const unrated = await service([gemini]).recommend(USER, COMPROMISES, {});

    for (const result of [disabled, none, single, unrated]) {
      expect(result.source).toBe('fallback');
    }
    expect(gemini.calls).toHaveLength(0);
    expect(unrated.picks[0]?.reason).not.toContain('דירגת');
  });

  it('identical concurrent questions share one model call', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gemini = new FakeProvider('gemini', [
      async () => {
        await gate;
        return { text: GOOD_ANSWER, inputTokens: 100, outputTokens: 40 };
      },
    ]);
    const recommendations = service([gemini]);

    const both = Promise.all([
      recommendations.recommend(USER, COMPROMISES, PRIORITIES),
      recommendations.recommend(8, COMPROMISES, PRIORITIES),
    ]);
    release();
    const [first, second] = await both;

    expect(gemini.calls).toHaveLength(1);
    expect(first.source).toBe('llm');
    expect(second.source).toBe('llm');
    expect(second.aiQuotaLeft).toBe(2);
  });

  it('keeps working when the database fails (fails open on quota, no cache)', async () => {
    const broken = () => Promise.reject(new Error('db down'));
    const recommendations = new CompromiseRecommendationService({
      providers: [new FakeProvider('gemini', [GOOD_ANSWER])],
      cache: { get: broken, set: broken } as unknown as AiCacheRepository,
      usage: {
        recommendationsOn: broken,
        add: broken,
        llmCallsOn: broken,
      } as unknown as AiUsageRepository,
      logger,
      options: {
        enabled: true,
        dailyQuota: 2,
        dailyCallLimit: 100,
        timeoutMs: 1000,
        maxOutputTokens: 300,
      },
    });

    await expect(recommendations.recommend(USER, COMPROMISES, PRIORITIES)).resolves.toMatchObject({
      source: 'llm',
    });
  });

  it('stops calling models for everyone once the daily call limit is reached', async () => {
    const gemini = new FakeProvider('gemini', [GOOD_ANSWER]);
    const recommendations = service([gemini], { dailyCallLimit: 1, dailyQuota: 10 });
    await recommendations.recommend(USER, COMPROMISES, PRIORITIES);

    const other = await recommendations.recommend(8, COMPROMISES, { ...PRIORITIES, rooms: 2 });

    expect(other.source).toBe('fallback');
    expect(gemini.calls).toHaveLength(1);
  });

  it('enforces the call limit from its own count when the database is down', async () => {
    const broken = () => Promise.reject(new Error('db down'));
    const gemini = new FakeProvider('gemini', [GOOD_ANSWER]);
    const recommendations = new CompromiseRecommendationService({
      providers: [gemini],
      cache: { get: broken, set: broken } as unknown as AiCacheRepository,
      usage: {
        recommendationsOn: broken,
        add: broken,
        llmCallsOn: broken,
      } as unknown as AiUsageRepository,
      logger,
      options: {
        enabled: true,
        dailyQuota: 10,
        dailyCallLimit: 1,
        timeoutMs: 1000,
        maxOutputTokens: 300,
      },
    });
    await recommendations.recommend(USER, COMPROMISES, PRIORITIES);

    const second = await recommendations.recommend(USER, COMPROMISES, { ...PRIORITIES, rooms: 2 });

    expect(second.source).toBe('fallback');
    expect(gemini.calls).toHaveLength(1);
  });
});
