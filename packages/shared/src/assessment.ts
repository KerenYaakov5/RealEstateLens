import { z } from 'zod';
import { FEATURES, type Feature, type FeaturePreference } from './criteria.js';
import type { DealDto } from './api.js';
import { propertyConditionSchema, propertyTypeSchema } from './enums.js';

/** Longest URL the API accepts (path + query). Longer requests get 414. */
export const MAX_URL_LENGTH = 2048;

/** One digit per feature in the query string: 0 = don't care, 1 = required, 2 = preferred. */
export const FEATURE_CODES = { '0': 'any', '1': 'required', '2': 'preferred' } as const;
export type FeatureCode = keyof typeof FEATURE_CODES;

const CODE_BY_PREFERENCE: Readonly<Record<FeaturePreference, FeatureCode>> = {
  any: '0',
  required: '1',
  preferred: '2',
};

const featureCode = z
  .enum(['0', '1', '2'])
  .default('0')
  .transform((code) => {
    return FEATURE_CODES[code];
  });

function commaList<T extends z.ZodType<unknown, string>>(item: T) {
  return z
    .string()
    .transform((value) => {
      return value.split(',').filter((part) => {
        return part.length > 0;
      });
    })
    .pipe(z.array(item).min(1));
}

const positiveInt = z.coerce.number().int().positive();

/** GET /market-assessments query string. */
export const assessmentQuerySchema = z
  .object({
    cityId: positiveInt,
    neighborhoodId: positiveInt.optional(),
    maxPrice: positiveInt,
    rooms: z.coerce.number().min(1).max(12).multipleOf(0.5).optional(),
    propertyType: commaList(propertyTypeSchema).optional(),
    condition: commaList(propertyConditionSchema).optional(),
    minSize: positiveInt.optional(),
    minFloor: z.coerce.number().int().optional(),
    maxFloor: z.coerce.number().int().optional(),
    safeRoom: featureCode,
    elevator: featureCode,
    parking: featureCode,
    balcony: featureCode,
  })
  .refine(
    (query) => {
      return (
        query.minFloor === undefined ||
        query.maxFloor === undefined ||
        query.minFloor <= query.maxFloor
      );
    },
    { message: 'קומה מינימלית גבוהה מהמקסימלית', path: ['minFloor'] },
  );

export type AssessmentQuery = z.infer<typeof assessmentQuerySchema>;

export interface AssessmentRequest {
  cityId: number;
  neighborhoodId?: number;
  maxPrice: number;
  rooms?: number;
  propertyType?: readonly string[];
  condition?: readonly string[];
  minSize?: number;
  minFloor?: number;
  maxFloor?: number;
  features?: Partial<Record<Feature, FeaturePreference>>;
}

/**
 * Builds the shortest query string for a request: defaults ("don't care") and empty filters
 * are omitted, features are a single digit each.
 */
export function toAssessmentQueryString(request: AssessmentRequest): string {
  const params = new URLSearchParams();
  params.set('cityId', String(request.cityId));
  params.set('maxPrice', String(request.maxPrice));
  const optional: [string, number | undefined][] = [
    ['neighborhoodId', request.neighborhoodId],
    ['rooms', request.rooms],
    ['minSize', request.minSize],
    ['minFloor', request.minFloor],
    ['maxFloor', request.maxFloor],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  if (request.propertyType !== undefined && request.propertyType.length > 0) {
    params.set('propertyType', request.propertyType.join(','));
  }
  if (request.condition !== undefined && request.condition.length > 0) {
    params.set('condition', request.condition.join(','));
  }
  for (const feature of FEATURES) {
    const preference = request.features?.[feature] ?? 'any';
    if (preference !== 'any') {
      params.set(feature, CODE_BY_PREFERENCE[preference]);
    }
  }
  // Commas are safe in a query string; keeping them literal keeps the URL short and readable.
  return params.toString().replace(/%2C/g, ',');
}

// ---- Response ----

export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';

export interface FeasibilityDto {
  /** Share of matching deals sold within budget; null when too few deals to say. */
  matchRate: number | null;
  poolSize: number;
  affordableCount: number;
  /** Deals that may match but miss data needed to confirm a requirement. */
  unknownCount: number;
  confidence: Confidence;
}

export type CompromiseType =
  | 'dropFeature'
  | 'fewerRooms'
  | 'anyNeighborhood'
  | 'otherNeighborhood'
  | 'nearbyCity'
  | 'raiseBudget';

export interface FactDto {
  id: string;
  key: string;
  value: number | string;
}

export interface CompromiseDto {
  id: string;
  type: CompromiseType;
  params: {
    feature?: Feature;
    rooms?: number;
    neighborhood?: string;
    cityId?: number;
    cityName?: string;
    distanceKm?: number;
    newMaxPrice?: number;
  };
  feasibility: FeasibilityDto;
  /** Improvement in match rate (0–1). */
  delta: number;
  /** The only values an explanation may cite. */
  facts: FactDto[];
}

export type HousePartName = 'structure' | Feature;
export type HousePartStatus = 'full' | 'partial' | 'missing' | 'unknown';

export interface HousePartDto {
  part: HousePartName;
  preference: FeaturePreference | null;
  share: number | null;
  knownCount: number;
  status: HousePartStatus;
}

export interface ValueRangeDto {
  low: number;
  high: number;
}

/** Thresholds behind the numbers, so the UI can explain them. */
export interface MethodologyDto {
  minDealsForRate: number;
  confidenceMediumFrom: number;
  confidenceHighFrom: number;
  roomsTolerance: number;
  nearbyCityMaxKm: number;
  maxBudgetRatio: number;
  priceIndexSource: string;
}

export interface MarketAssessmentDto {
  city: { id: number; name: string };
  neighborhood: { id: number; name: string } | null;
  /** CBS index month that adjusted prices are expressed in (YYYY-MM-01), or null. */
  referencePeriod: string | null;
  feasibility: FeasibilityDto;
  cityLevel: FeasibilityDto | null;
  compromises: CompromiseDto[];
  typicalForBudget: {
    dealCount: number;
    rooms: ValueRangeDto;
    sizeSqm: ValueRangeDto | null;
  } | null;
  houseParts: HousePartDto[];
  referenceDeals: (DealDto & { matchedPreferences: Feature[] })[];
  methodology: MethodologyDto;
}
