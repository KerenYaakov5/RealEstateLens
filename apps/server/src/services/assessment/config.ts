/**
 * Every threshold the assessment engine uses. These are methodology choices, not facts about
 * the market – they live in one place so they can be shown to the user and tuned.
 */
export const ASSESSMENT_CONFIG = {
  /** Pool size → confidence. Below `minPoolForRate` no percentage and no conclusion is shown. */
  confidence: {
    minPoolForRate: 3,
    mediumFrom: 5,
    highFrom: 15,
  },
  /** When a neighborhood pool is smaller than this, a city-wide figure is shown as well. */
  cityLevelFallbackBelow: 5,
  /** A requested room count also matches deals within ± this many rooms. */
  roomsTolerance: 0.5,
  /** A compromise is offered only if its own pool has at least this many deals. */
  minCompromisePool: 3,
  /** Cities within this straight-line distance (official CBS coordinates) count as "nearby". */
  nearbyCityMaxKm: 25,
  /** "Raise the budget" targets the price at which this share of the pool becomes affordable. */
  budgetTargetShare: 0.5,
  /** "Raise the budget" is offered only if the target is at most this multiple of the budget. */
  maxBudgetRatio: 1.5,
  /** House visual: share of affordable deals that have a part → full / partial / missing. */
  houseParts: { fullFrom: 0.5, partialFrom: 0.2, minKnown: 3 },
  /** "What you can get": the spread shown as "most deals" (percentiles). */
  typicalRange: { low: 0.25, high: 0.75, minDeals: 3 },
  maxReferenceDeals: 10,
} as const;
