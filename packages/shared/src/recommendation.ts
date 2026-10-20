import { z } from 'zod';
import type { CompromiseDto } from './assessment.js';
import { FEATURE_LABELS, FEATURES } from './criteria.js';

// Labels take the Hebrew article: "דירגת את החניה…".

/**
 * Requirements the user can rate by importance (1–5) for a personal recommendation. Each
 * compromise relaxes exactly one of them (see priorityKeyOf).
 */
export const PRIORITY_KEYS = ['budget', 'city', 'neighborhood', 'rooms', ...FEATURES] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export const PRIORITY_LABELS: Readonly<Record<PriorityKey, string>> = {
  budget: 'התקציב',
  city: 'העיר',
  neighborhood: 'השכונה',
  rooms: 'מספר החדרים',
  safeRoom: `ה${FEATURE_LABELS.safeRoom}`,
  elevator: `ה${FEATURE_LABELS.elevator}`,
  parking: `ה${FEATURE_LABELS.parking}`,
  balcony: `ה${FEATURE_LABELS.balcony}`,
};

export const MIN_PRIORITY = 1;
export const MAX_PRIORITY = 5;

export type Priorities = Partial<Record<PriorityKey, number>>;

/** The requirement a compromise gives up – the priority that decides whether it suits the user. */
export function priorityKeyOf(compromise: Pick<CompromiseDto, 'type' | 'params'>): PriorityKey {
  switch (compromise.type) {
    case 'dropFeature':
      return compromise.params.feature ?? 'budget';
    case 'fewerRooms':
      return 'rooms';
    case 'anyNeighborhood':
    case 'otherNeighborhood':
      return 'neighborhood';
    case 'nearbyCity':
      return 'city';
    case 'raiseBudget':
      return 'budget';
  }
}

/**
 * How a rating reads in a reason: "קל לך לוותר על החניה (1 מתוך 5)". Ratings of 4–5 are
 * phrased as a concession ("למרות שקשה לך לוותר על…").
 */
export function ratingPhrase(key: PriorityKey, rating: number): string {
  const label = PRIORITY_LABELS[key];
  const scale = `(${rating} מתוך ${MAX_PRIORITY})`;
  if (rating >= 4) {
    return `למרות שקשה לך לוותר על ${label} ${scale}`;
  }
  if (rating === 3) {
    return `קשה לך במידה בינונית לוותר על ${label} ${scale}`;
  }
  return `קל לך לוותר על ${label} ${scale}`;
}

const priority = z.number().int().min(MIN_PRIORITY).max(MAX_PRIORITY);

export const prioritiesSchema = z.partialRecord(z.enum(PRIORITY_KEYS), priority);

/** The same requirements as GET /market-assessments, as JSON (see toAssessmentQueryString). */
export const assessmentRequestSchema = z.object({
  cityId: z.number().int().positive(),
  neighborhoodId: z.number().int().positive().optional(),
  neighborhood: z.string().max(100).optional(),
  maxPrice: z.number().int().positive(),
  rooms: z.number().optional(),
  minRooms: z.number().int().optional(),
  propertyType: z.array(z.string()).max(10).optional(),
  condition: z.array(z.string()).max(10).optional(),
  minSize: z.number().int().positive().optional(),
  minFloor: z.number().int().optional(),
  maxFloor: z.number().int().optional(),
  features: z.partialRecord(z.enum(FEATURES), z.enum(['required', 'preferred', 'any'])).optional(),
});

/** POST /compromise-recommendations body. */
export const recommendationRequestSchema = z.object({
  criteria: assessmentRequestSchema,
  priorities: prioritiesSchema,
});

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

/**
 * Where the picks came from: the model (`llm`), an earlier identical model answer (`cache`), or
 * the deterministic ranking with template reasons (`fallback`, shown as "automatic").
 */
export type RecommendationSource = 'llm' | 'cache' | 'fallback';

export interface RecommendationPickDto {
  /** Id of a compromise in the matching GET /market-assessments response. */
  compromiseId: string;
  /** Hebrew; cites only computed facts and the user's own priorities. */
  reason: string;
}

export interface RecommendationDto {
  picks: RecommendationPickDto[];
  source: RecommendationSource;
  /** Personal recommendations the user has left today. */
  aiQuotaLeft: number;
}
