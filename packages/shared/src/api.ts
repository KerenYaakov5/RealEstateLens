import { z } from 'zod';
import {
  dealSourceSchema,
  propertyConditionSchema,
  propertyTypeSchema,
  type DealSource,
  type PropertyCondition,
  type PropertyType,
} from './enums.js';
import type { Feature } from './criteria.js';

// ---- Query-string helpers (every value arrives as a string) ----

const intParam = z.coerce.number().int();
const nonNegativeInt = intParam.min(0);
const id = intParam.positive();

/** `1` → true, `0` → false; anything else is a validation error. */
const flag = z.enum(['0', '1']).transform((value) => {
  return value === '1';
});

/** Comma-separated list, e.g. `propertyType=apartment,penthouse`. */
function listOf<T extends z.ZodType<unknown, string>>(item: T) {
  return z
    .string()
    .transform((value) => {
      return value
        .split(',')
        .map((part) => {
          return part.trim();
        })
        .filter((part) => {
          return part.length > 0;
        });
    })
    .pipe(z.array(item).min(1));
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const DEAL_SORT_FIELDS = ['dealDate', 'price', 'pricePerSqm', 'size'] as const;

/** GET /deals – every filter is optional; a filter that is not sent does not limit results. */
export const dealsQuerySchema = z.object({
  cityId: id.optional(),
  neighborhoodId: id.optional(),
  propertyType: listOf(propertyTypeSchema).optional(),
  condition: listOf(propertyConditionSchema).optional(),
  source: listOf(dealSourceSchema).optional(),
  minRooms: z.coerce.number().min(0).optional(),
  maxRooms: z.coerce.number().min(0).optional(),
  minSize: nonNegativeInt.optional(),
  maxSize: nonNegativeInt.optional(),
  minPrice: nonNegativeInt.optional(),
  maxPrice: nonNegativeInt.optional(),
  minFloor: intParam.optional(),
  maxFloor: intParam.optional(),
  minYearBuilt: intParam.optional(),
  hasSafeRoom: flag.optional(),
  hasElevator: flag.optional(),
  hasParking: flag.optional(),
  hasBalcony: flag.optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  page: id.default(1),
  pageSize: id.max(100).default(20),
  sortBy: z.enum(DEAL_SORT_FIELDS).default('dealDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type DealsQuery = z.infer<typeof dealsQuerySchema>;

// ---- Response shapes ----

export interface CityDto {
  id: number;
  name: string;
  nameEn: string;
  dealCount: number;
  /** False when no official coordinates exist (the city is then never offered as "nearby"). */
  hasOfficialLocation: boolean;
}

export interface NeighborhoodDto {
  id: number;
  name: string;
  dealCount: number;
}

export interface DealDto {
  id: number;
  dealId: string;
  city: { id: number; name: string };
  neighborhood: { id: number; name: string } | null;
  street: string;
  propertyType: PropertyType;
  rooms: number;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number;
  yearBuilt: number | null;
  condition: PropertyCondition | null;
  /** null = not stated in the source. */
  features: Record<Feature, boolean | null>;
  dealDate: string | null;
  priceNis: number;
  /** Price in the CBS index reference month; equals priceNis when not adjusted. */
  adjustedPriceNis: number;
  isAdjusted: boolean;
  pricePerSqm: number | null;
  source: DealSource;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}
