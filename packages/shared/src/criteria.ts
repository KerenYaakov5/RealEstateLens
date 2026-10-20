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

/** The budget slider's scale. The server rounds suggested budgets to the same step. */
export const BUDGET_MIN = 500_000;
export const BUDGET_STEP = 500_000;

/** 3,889,710 → 4,000,000: the next budget the slider can show. */
export function roundUpToBudgetStep(value: number): number {
  return Math.max(BUDGET_MIN, Math.ceil(value / BUDGET_STEP) * BUDGET_STEP);
}
