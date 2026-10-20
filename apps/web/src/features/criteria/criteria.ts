import {
  BUDGET_MIN,
  BUDGET_STEP,
  FEATURES,
  roundUpToBudgetStep,
  type AssessmentRequest,
  type CompromiseDto,
  type Feature,
  type FeaturePreference,
  propertyTypeSchema,
  type PropertyType,
} from '@rel/shared';
import { z } from 'zod';

export interface Place {
  id: number;
  name: string;
}

/** A neighborhood picked from the list, or free text the user typed (never stored server-side). */
export type NeighborhoodChoice =
  { kind: 'list'; id: number; name: string } | { kind: 'text'; text: string };

export interface CriteriaState {
  city: Place | null;
  neighborhood: NeighborhoodChoice | null;
  maxPrice: number;
  rooms: number | null;
  propertyTypes: PropertyType[];
  minSize: number | null;
  features: Record<Feature, FeaturePreference>;
}

/** The last rooms choice means "this many or more" ("6+"). */
export const ROOMS_OR_MORE = 6;

/**
 * "4" / "6+". The "6+" is wrapped in a left-to-right isolate: in Hebrew text the "+" would
 * otherwise be drawn first ("+6").
 */
export function roomsChoiceLabel(rooms: number): string {
  return rooms >= ROOMS_OR_MORE ? `\u2066${ROOMS_OR_MORE}+\u2069` : String(rooms);
}

/**
 * The budget slider. Its upper end comes from the data (GET /cities → meta.budgetMax);
 * `fallbackMax` is used until that arrives, `hardMax` only guards stored values.
 */
export const BUDGET = {
  min: BUDGET_MIN,
  step: BUDGET_STEP,
  fallbackMax: 15_000_000,
  hardMax: 100_000_000,
} as const;

export const DEFAULT_CRITERIA: CriteriaState = {
  city: null,
  neighborhood: null,
  maxPrice: 2_500_000,
  rooms: null,
  propertyTypes: [],
  minSize: null,
  features: { safeRoom: 'any', elevator: 'any', parking: 'any', balcony: 'any' },
};

export type CriteriaAction =
  | { type: 'setCity'; city: Place | null }
  | { type: 'setNeighborhood'; neighborhood: NeighborhoodChoice | null }
  | { type: 'setMaxPrice'; maxPrice: number }
  | { type: 'setRooms'; rooms: number | null }
  | { type: 'togglePropertyType'; propertyType: PropertyType }
  /** "הכל": no property type filter. */
  | { type: 'clearPropertyTypes' }
  | { type: 'setMinSize'; minSize: number | null }
  | { type: 'setFeature'; feature: Feature; preference: FeaturePreference }
  | { type: 'applyCompromise'; compromise: CompromiseDto }
  | { type: 'reset' };

/** On the slider's scale: a whole step, within range. */
function clampBudget(value: number): number {
  const stepped = Math.round(value / BUDGET.step) * BUDGET.step;
  return Math.min(BUDGET.hardMax, Math.max(BUDGET.min, stepped));
}

/** What choosing a compromise card changes in the requirements. */
function applyCompromise(state: CriteriaState, compromise: CompromiseDto): CriteriaState {
  const { params } = compromise;
  switch (compromise.type) {
    case 'dropFeature':
      return params.feature === undefined
        ? state
        : { ...state, features: { ...state.features, [params.feature]: 'any' } };
    case 'fewerRooms':
      return params.rooms === undefined ? state : { ...state, rooms: params.rooms };
    case 'anyNeighborhood':
      return { ...state, neighborhood: null };
    case 'otherNeighborhood':
      // The server resolves the exact name to its neighborhood.
      return params.neighborhood === undefined
        ? state
        : { ...state, neighborhood: { kind: 'text', text: params.neighborhood } };
    case 'nearbyCity':
      return params.cityId === undefined || params.cityName === undefined
        ? state
        : { ...state, city: { id: params.cityId, name: params.cityName }, neighborhood: null };
    case 'raiseBudget':
      return params.newMaxPrice === undefined
        ? state
        : { ...state, maxPrice: Math.min(BUDGET.hardMax, roundUpToBudgetStep(params.newMaxPrice)) };
  }
}

export function criteriaReducer(state: CriteriaState, action: CriteriaAction): CriteriaState {
  switch (action.type) {
    case 'setCity':
      // A neighborhood belongs to a city; changing city clears it.
      return { ...state, city: action.city, neighborhood: null };
    case 'setNeighborhood':
      return { ...state, neighborhood: action.neighborhood };
    case 'setMaxPrice':
      return { ...state, maxPrice: clampBudget(action.maxPrice) };
    case 'setRooms':
      return { ...state, rooms: action.rooms };
    case 'togglePropertyType': {
      const has = state.propertyTypes.includes(action.propertyType);
      return {
        ...state,
        propertyTypes: has
          ? state.propertyTypes.filter((type) => type !== action.propertyType)
          : [...state.propertyTypes, action.propertyType],
      };
    }
    case 'clearPropertyTypes':
      return { ...state, propertyTypes: [] };
    case 'setMinSize':
      return { ...state, minSize: action.minSize };
    case 'setFeature':
      return { ...state, features: { ...state.features, [action.feature]: action.preference } };
    case 'applyCompromise':
      return applyCompromise(state, action.compromise);
    case 'reset':
      return DEFAULT_CRITERIA;
  }
}

/** The API request for the current choices, or null until a city is chosen. */
export function toRequest(state: CriteriaState): AssessmentRequest | null {
  if (state.city === null) {
    return null;
  }
  return {
    cityId: state.city.id,
    maxPrice: state.maxPrice,
    ...(state.neighborhood?.kind === 'list' ? { neighborhoodId: state.neighborhood.id } : {}),
    ...(state.neighborhood?.kind === 'text' ? { neighborhood: state.neighborhood.text } : {}),
    ...(state.rooms === null
      ? {}
      : state.rooms >= ROOMS_OR_MORE
        ? { minRooms: ROOMS_OR_MORE }
        : { rooms: state.rooms }),
    ...(state.propertyTypes.length === 0 ? {} : { propertyType: state.propertyTypes }),
    ...(state.minSize === null ? {} : { minSize: state.minSize }),
    features: state.features,
  };
}

// ---- Persistence: validate whatever is stored, fall back to defaults if it does not fit ----

const preference = z.enum(['required', 'preferred', 'any']);
const storedSchema = z.object({
  city: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  neighborhood: z
    .union([
      z.object({ kind: z.literal('list'), id: z.number().int().positive(), name: z.string() }),
      z.object({ kind: z.literal('text'), text: z.string().min(1).max(100) }),
    ])
    .nullable(),
  // Budgets saved with an older, finer slider are moved to the nearest step.
  maxPrice: z.number().min(BUDGET.min).max(BUDGET.hardMax).transform(clampBudget),
  rooms: z.number().min(1).max(12).nullable(),
  propertyTypes: z.array(propertyTypeSchema),
  minSize: z.number().int().positive().nullable(),
  features: z.object(
    Object.fromEntries(FEATURES.map((feature) => [feature, preference])) as Record<
      Feature,
      typeof preference
    >,
  ),
});

export function parseStoredCriteria(value: unknown): CriteriaState {
  const parsed = storedSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CRITERIA;
}
