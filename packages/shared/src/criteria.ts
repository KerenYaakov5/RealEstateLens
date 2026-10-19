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
  propertyTypes?: PropertyType[];
  conditions?: PropertyCondition[];
  minSizeSqm?: number;
  minFloor?: number;
  maxFloor?: number;
  features: Record<Feature, FeaturePreference>;
}
