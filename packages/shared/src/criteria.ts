import { z } from 'zod';
import { propertyConditionSchema, propertyTypeSchema } from './enums.js';

/** Yes/no features the user can mark as required, preferred, or "don't care" (default). */
export const FEATURES = ['safeRoom', 'elevator', 'parking', 'balcony'] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Readonly<Record<Feature, string>> = {
  safeRoom: 'ממ"ד',
  elevator: 'מעלית',
  parking: 'חניה',
  balcony: 'מרפסת',
};

export const featurePreferenceSchema = z.enum(['required', 'preferred', 'any']);
export type FeaturePreference = z.infer<typeof featurePreferenceSchema>;

const preference = featurePreferenceSchema.default('any');

/** What the user is looking for. Every filter except city and budget is optional. */
export const marketCriteriaSchema = z
  .object({
    cityKey: z.string().min(1),
    neighborhood: z.string().min(1).optional(),
    maxPrice: z.number().int().positive(),
    rooms: z.number().min(1).max(12).multipleOf(0.5).optional(),
    propertyTypes: z.array(propertyTypeSchema).min(1).optional(),
    conditions: z.array(propertyConditionSchema).min(1).optional(),
    minSizeSqm: z.number().int().positive().optional(),
    minFloor: z.number().int().optional(),
    maxFloor: z.number().int().optional(),
    features: z
      .object({
        safeRoom: preference,
        elevator: preference,
        parking: preference,
        balcony: preference,
      })
      .default({ safeRoom: 'any', elevator: 'any', parking: 'any', balcony: 'any' }),
  })
  .refine(
    (criteria) => {
      return (
        criteria.minFloor === undefined ||
        criteria.maxFloor === undefined ||
        criteria.minFloor <= criteria.maxFloor
      );
    },
    { message: 'קומה מינימלית גבוהה מהמקסימלית', path: ['minFloor'] },
  );

export type MarketCriteria = z.infer<typeof marketCriteriaSchema>;
