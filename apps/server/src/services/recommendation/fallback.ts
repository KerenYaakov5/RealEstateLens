import {
  MAX_PRIORITY,
  PRIORITY_LABELS,
  type Priorities,
  type RecommendationPickDto,
} from '@rel/shared';
import { RECOMMENDATION_CONFIG } from './config.js';
import type { LlmInput } from './llmInput.js';

/**
 * The automatic recommendation: the deterministic ranking (by improvement) with template
 * reasons built only from the same facts the model would get.
 */
export function fallbackPicks(input: LlmInput, priorities: Priorities): RecommendationPickDto[] {
  return input.candidates.slice(0, RECOMMENDATION_CONFIG.maxPicks).map((candidate) => {
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
