import {
  MAX_PRIORITY,
  MIN_PRIORITY,
  PRIORITY_LABELS,
  type Priorities,
  type RecommendationPickDto,
} from '@rel/shared';
import { RECOMMENDATION_CONFIG } from './config.js';
import type { LlmCandidate, LlmInput } from './llmInput.js';

/** An unrated requirement counts as neither important nor unimportant. */
const NEUTRAL_RATING = (MIN_PRIORITY + MAX_PRIORITY) / 2;

/**
 * The automatic recommendation, used when the model is off, unavailable or wrong: first the
 * compromises that give up what the user rated least important, then by improvement (the input
 * order). Template reasons use only the same facts the model would get.
 */
export function fallbackPicks(input: LlmInput, priorities: Priorities): RecommendationPickDto[] {
  const ratingOf = (candidate: LlmCandidate): number => {
    return priorities[candidate.give] ?? NEUTRAL_RATING;
  };
  // Array.prototype.sort is stable, so equal ratings keep the improvement order.
  const ranked = [...input.candidates].sort((a, b) => {
    return ratingOf(a) - ratingOf(b);
  });
  return ranked.slice(0, RECOMMENDATION_CONFIG.maxPicks).map((candidate) => {
    const { rate, fit, pool } = candidate.facts;
    const rating = priorities[candidate.give];
    const ratingText =
      rating === undefined
        ? ''
        : `דירגת את ${PRIORITY_LABELS[candidate.give]} בחשיבות ${rating} מתוך ${MAX_PRIORITY}. `;
    return {
      compromiseId: candidate.compromiseId,
      reason: `${ratingText}עם השינוי הזה ${rate}% מהעסקאות המתאימות נמכרו בתקציב (${fit} מתוך ${pool}).`,
    };
  });
}
