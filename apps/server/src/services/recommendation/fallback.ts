import {
  MAX_PRIORITY,
  MIN_PRIORITY,
  ratingPhrase,
  type Priorities,
  type RecommendationPickDto,
} from '@rel/shared';
import { RECOMMENDATION_CONFIG } from './config.js';
import type { LlmCandidate, LlmInput } from './llmInput.js';

/** An unrated requirement counts as neither important nor unimportant. */
const NEUTRAL_RATING = (MIN_PRIORITY + MAX_PRIORITY) / 2;

/**
 * The one ordering rule for every recommendation: what is easiest for the user to give up comes
 * first. The sort is stable, so equal ratings keep the order they came in (by improvement for
 * the automatic picks, the model's own order for its picks).
 */
export function orderByRating<T>(
  items: readonly T[],
  candidateOf: (item: T) => LlmCandidate | undefined,
  priorities: Priorities,
): T[] {
  const ratingOf = (item: T): number => {
    const candidate = candidateOf(item);
    return candidate === undefined
      ? NEUTRAL_RATING
      : (priorities[candidate.give] ?? NEUTRAL_RATING);
  };
  return [...items].sort((a, b) => {
    return ratingOf(a) - ratingOf(b);
  });
}

/**
 * The automatic recommendation, used when the model is off, unavailable or wrong. Template
 * reasons use only the same facts the model would get.
 */
export function fallbackPicks(input: LlmInput, priorities: Priorities): RecommendationPickDto[] {
  const ranked = orderByRating(input.candidates, (candidate) => candidate, priorities);
  return ranked.slice(0, RECOMMENDATION_CONFIG.maxPicks).map((candidate) => {
    const { rate, fit, pool, now } = candidate.facts;
    const rating = priorities[candidate.give];
    const ratingText =
      rating === undefined
        ? ''
        : `${ratingPhrase(candidate.give, rating)}${rating >= 4 ? ':' : ';'} `;
    return {
      compromiseId: candidate.compromiseId,
      reason: `${ratingText}עם השינוי הזה ${rate}% מהעסקאות המתאימות נמכרו בתקציב (${fit} מתוך ${pool})${now === undefined ? '' : `, לעומת ${now}% בחיפוש הנוכחי`}.`,
    };
  });
}
