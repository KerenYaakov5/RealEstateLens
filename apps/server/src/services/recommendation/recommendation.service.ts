import type {
  CompromiseDto,
  Priorities,
  RecommendationDto,
  RecommendationPickDto,
} from '@rel/shared';
import { CircuitBreaker } from '../../clients/llm/circuitBreaker.js';
import {
  LlmUnavailableError,
  type LlmMessage,
  type LlmProvider,
  type LlmResponse,
} from '../../clients/llm/types.js';
import { AppError } from '../../errors/AppError.js';
import { LruCache } from '../../lib/lruCache.js';
import type { Logger } from '../../lib/logger.js';
import type { AiCacheRepository, CachedAnswer } from '../../repositories/aiCache.repository.js';
import type { AiUsageRepository } from '../../repositories/aiUsage.repository.js';
import { RECOMMENDATION_CONFIG } from './config.js';
import { fallbackPicks } from './fallback.js';
import {
  buildLlmInput,
  cacheKeyOf,
  isWorthAsking,
  serializeLlmInput,
  type LlmInput,
} from './llmInput.js';
import { ANSWER_SCHEMA, SYSTEM_PROMPT, repairMessage } from './prompt.js';
import { validateAnswer } from './validator.js';

export interface RecommendationOptions {
  /** Kill switch: false = always the automatic recommendation, no model calls. */
  enabled: boolean;
  dailyQuota: number;
  timeoutMs: number;
  maxOutputTokens: number;
}

export interface RecommendationDeps {
  /** In order of preference; providers without an API key are simply not passed. */
  providers: LlmProvider[];
  cache: AiCacheRepository;
  usage: AiUsageRepository;
  logger: Logger;
  options: RecommendationOptions;
  now?: () => number;
}

type Answer = { kind: 'llm'; picks: RecommendationPickDto[] } | { kind: 'fallback' };

/** "YYYY-MM-DD" in Israel – the quota resets at local midnight. */
export function israelDay(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(epochMs);
}

/**
 * Personal compromise picks. Order of preference, cheapest first: memory cache → database
 * cache (neither uses quota) → the model (one quota unit per validated answer) → automatic
 * ranking. Model answers are validated before use; a wrong answer gets one repair attempt, an
 * unavailable provider is skipped for the next one, and a failing provider is skipped entirely
 * for a while (circuit breaker).
 */
export class CompromiseRecommendationService {
  private readonly memory = new LruCache<CachedAnswer>(RECOMMENDATION_CONFIG.memoryCacheEntries);
  private readonly inFlight = new Map<string, Promise<Answer>>();
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly now: () => number;

  constructor(private readonly deps: RecommendationDeps) {
    this.now = deps.now ?? Date.now;
    for (const provider of deps.providers) {
      this.breakers.set(provider.name, new CircuitBreaker(undefined, this.now));
    }
  }

  async quotaLeft(userId: number): Promise<number> {
    const used = await this.usedToday(userId);
    return Math.max(0, this.deps.options.dailyQuota - used);
  }

  async recommend(
    userId: number,
    compromises: readonly CompromiseDto[],
    priorities: Priorities,
  ): Promise<RecommendationDto> {
    const input = buildLlmInput(compromises, priorities);
    const automatic = async (): Promise<RecommendationDto> => {
      return {
        picks: fallbackPicks(input, priorities),
        source: 'fallback',
        aiQuotaLeft: await this.quotaLeft(userId),
      };
    };
    if (!this.deps.options.enabled || this.deps.providers.length === 0 || !isWorthAsking(input)) {
      return automatic();
    }

    const key = cacheKeyOf(input);
    const cached = await this.cached(key);
    if (cached !== undefined) {
      this.deps.logger.info(
        { cache: 'hit', provider: cached.provider },
        'Recommendation from cache',
      );
      return { picks: cached.picks, source: 'cache', aiQuotaLeft: await this.quotaLeft(userId) };
    }

    const used = await this.usedToday(userId);
    if (used >= this.deps.options.dailyQuota) {
      throw new AppError(
        429,
        'AI_QUOTA_EXCEEDED',
        'ניצלת את ההמלצות האישיות להיום. הדירוג האוטומטי ממשיך להופיע, ומחר אפשר לבקש שוב.',
      );
    }

    // Identical questions arriving together share one model call.
    let pending = this.inFlight.get(key);
    if (pending === undefined) {
      pending = this.askModels(userId, key, input).finally(() => {
        this.inFlight.delete(key);
      });
      this.inFlight.set(key, pending);
    }
    const answer = await pending;
    if (answer.kind === 'fallback') {
      return automatic();
    }
    // Read again: a request that joined someone else's in-flight call was not charged.
    return { picks: answer.picks, source: 'llm', aiQuotaLeft: await this.quotaLeft(userId) };
  }

  private async askModels(userId: number, key: string, input: LlmInput): Promise<Answer> {
    for (const provider of this.deps.providers) {
      const breaker = this.breakers.get(provider.name);
      if (breaker !== undefined && !breaker.tryAcquire()) {
        this.deps.logger.warn({ provider: provider.name }, 'LLM provider skipped (circuit open)');
        continue;
      }
      try {
        const picks = await this.askProvider(userId, provider, input);
        breaker?.recordSuccess();
        if (picks === null) {
          // The provider answered, but wrongly even after a repair: a second provider would
          // cost more tokens for the same kind of risk, so show the automatic ranking.
          return { kind: 'fallback' };
        }
        const answer: CachedAnswer = { picks, provider: provider.name, model: provider.model };
        this.memory.set(key, answer);
        await this.safely('ai_cache write', () => {
          return this.deps.cache.set(key, RECOMMENDATION_CONFIG.promptVersion, answer);
        });
        await this.safely('ai_usage write', () => {
          return this.deps.usage.add(userId, israelDay(this.now()), {
            recommendations: 1,
            llmCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
          });
        });
        return { kind: 'llm', picks };
      } catch (err) {
        if (!(err instanceof LlmUnavailableError)) {
          throw err;
        }
        breaker?.recordFailure();
      }
    }
    this.deps.logger.warn('No LLM provider available – automatic recommendation');
    return { kind: 'fallback' };
  }

  /** One provider: an answer, a repair attempt if it is invalid, or null if still invalid. */
  private async askProvider(
    userId: number,
    provider: LlmProvider,
    input: LlmInput,
  ): Promise<RecommendationPickDto[] | null> {
    const messages: LlmMessage[] = [{ role: 'user', text: serializeLlmInput(input) }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.call(userId, provider, messages, attempt);
      const result = validateAnswer(response.text, input);
      if (result.ok) {
        return result.picks;
      }
      this.deps.logger.warn(
        { provider: provider.name, attempt, errors: result.errors },
        'LLM answer rejected by validator',
      );
      messages.push(
        { role: 'assistant', text: response.text },
        { role: 'user', text: repairMessage(result.errors) },
      );
    }
    return null;
  }

  private async call(
    userId: number,
    provider: LlmProvider,
    messages: LlmMessage[],
    attempt: number,
  ): Promise<LlmResponse> {
    const startedAt = this.now();
    try {
      const response = await provider.complete({
        system: SYSTEM_PROMPT,
        messages,
        responseSchema: ANSWER_SCHEMA,
        maxOutputTokens: this.deps.options.maxOutputTokens,
        timeoutMs: this.deps.options.timeoutMs,
      });
      this.deps.logger.info(
        {
          provider: provider.name,
          model: provider.model,
          attempt,
          ms: this.now() - startedAt,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        'LLM call',
      );
      await this.safely('ai_usage write', () => {
        return this.deps.usage.add(userId, israelDay(this.now()), {
          recommendations: 0,
          llmCalls: 1,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });
      });
      return response;
    } catch (err) {
      this.deps.logger.warn(
        {
          provider: provider.name,
          model: provider.model,
          attempt,
          ms: this.now() - startedAt,
          err: (err as Error).message,
        },
        'LLM call failed',
      );
      throw err;
    }
  }

  private async cached(key: string): Promise<CachedAnswer | undefined> {
    const inMemory = this.memory.get(key);
    if (inMemory !== undefined) {
      return inMemory;
    }
    const stored = await this.safely('ai_cache read', () => {
      return this.deps.cache.get(key);
    });
    if (stored !== undefined) {
      this.memory.set(key, stored);
    }
    return stored;
  }

  /** Quota is a cost guard: if the database can't tell, fail open rather than block users. */
  private async usedToday(userId: number): Promise<number> {
    return (
      (await this.safely('ai_usage read', () => {
        return this.deps.usage.recommendationsOn(userId, israelDay(this.now()));
      })) ?? 0
    );
  }

  /** Cache and usage bookkeeping must never break a recommendation. */
  private async safely<T>(what: string, action: () => Promise<T>): Promise<T | undefined> {
    try {
      return await action();
    } catch (err) {
      this.deps.logger.error({ err }, `${what} failed`);
      return undefined;
    }
  }
}
