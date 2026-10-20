/**
 * Methodology of the personal recommendation layer. Changing the prompt or the input format
 * must bump PROMPT_VERSION – it is part of the cache key, so old answers stop being served.
 */
export const RECOMMENDATION_CONFIG = {
  promptVersion: 1,
  /** Only the best candidates (by improvement) are sent – fewer input tokens, same top picks. */
  maxCandidates: 6,
  maxPicks: 3,
  maxReasonLength: 160,
  /** Validated model answers kept in memory (the database keeps all of them). */
  memoryCacheEntries: 1000,
  /**
   * Phrases that signal forecasts, advice or outside knowledge – none of which our deals
   * support. Matched as substrings of the Hebrew reason.
   */
  forbiddenPhrases: [
    'יעלה',
    'יעלו',
    'יירד',
    'ירידת מחיר',
    'עליית מחיר',
    'תחזית',
    'צפוי',
    'כדאי לקנות',
    'השקעה',
    'תשואה',
    'משכנתא',
    'ריבית',
    'בית ספר',
    'בתי ספר',
    'גן ילדים',
    'גני ילדים',
    'תחבורה',
    'רכבת',
    'אוטובוס',
    'משפחה',
    'ילדים',
    'שכנים',
    'שקט',
    'בטיחות',
    'ביטחון',
    'אווירה',
  ],
} as const;
