import type { PropertyCondition, PropertyType } from './enums.js';

/** Yes/no features the user can mark as required, preferred, or "don't care" (default). */
export const FEATURES = ['safeRoom', 'elevator', 'parking', 'balcony'] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Readonly<Record<Feature, string>> = {
  safeRoom: 'ממ"ד',
  elevator: 'מעלית',
  parking: 'חניה',
  balcony: 'מרפסת',
};

export type FeaturePreference = 'required' | 'preferred' | 'any';

/**
 * What the user is looking for – the assessment engine's input. The API builds it from the
 * validated query string (see assessmentQuerySchema); only city and budget are mandatory.
 */
export interface MarketCriteria {
  cityKey: string;
  neighborhood?: string;
  maxPrice: number;
  rooms?: number;
  /** "6+": at least this many rooms (with the same half-room tolerance). Not with `rooms`. */
  minRooms?: number;
  propertyTypes?: PropertyType[];
  conditions?: PropertyCondition[];
  minSizeSqm?: number;
  minFloor?: number;
  maxFloor?: number;
  features: Record<Feature, FeaturePreference>;
}

/**
 * The budget slider's scale: fine where most budgets are, coarse above. Each tier's step applies
 * up to its `upTo`. The server rounds suggested budgets to the same scale.
 */
export const BUDGET_MIN = 500_000;
const BUDGET_TIERS: readonly { upTo: number; step: number }[] = [
  { upTo: 5_000_000, step: 500_000 },
  { upTo: 10_000_000, step: 1_000_000 },
  { upTo: Number.POSITIVE_INFINITY, step: 5_000_000 },
];

/** 3,889,710 → 4,000,000 and 12,000,000 → 15,000,000: the next budget the slider can show. */
export function roundUpToBudgetScale(value: number): number {
  const target = Math.max(BUDGET_MIN, value);
  for (const tier of BUDGET_TIERS) {
    if (target <= tier.upTo) {
      return Math.min(tier.upTo, Math.ceil(target / tier.step) * tier.step);
    }
  }
  return target;
}

/** Every budget on the slider, from BUDGET_MIN up to `max` (rounded up onto the scale). */
export function budgetScale(max: number): number[] {
  const top = roundUpToBudgetScale(max);
  const values: number[] = [];
  for (let value = BUDGET_MIN; value <= top; value = roundUpToBudgetScale(value + 1)) {
    values.push(value);
  }
  return values;
}

/** The scale value closest to `value` (ties go up). */
export function nearestOnBudgetScale(value: number): number {
  const up = roundUpToBudgetScale(value);
  const scale = budgetScale(up);
  const down = scale.length > 1 ? (scale[scale.length - 2] ?? up) : up;
  return value - down < up - value ? down : up;
}
