import { ASSESSMENT_CONFIG } from './config.js';
import type { ComparablePool } from './pool.js';

export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';

export interface Feasibility {
  /** Share of the pool sold at or below the budget; null when the pool is too small to say. */
  matchRate: number | null;
  poolSize: number;
  affordableCount: number;
  unknownCount: number;
  confidence: Confidence;
}

export function confidenceFor(poolSize: number): Confidence {
  const { minPoolForRate, mediumFrom, highFrom } = ASSESSMENT_CONFIG.confidence;
  if (poolSize < minPoolForRate) {
    return 'insufficient';
  }
  if (poolSize < mediumFrom) {
    return 'low';
  }
  if (poolSize < highFrom) {
    return 'medium';
  }
  return 'high';
}

/** "Of the apartments that match what you want, how many sold within your budget?" */
export function computeFeasibility(pool: ComparablePool, maxPrice: number): Feasibility {
  const poolSize = pool.deals.length;
  const affordableCount = pool.deals.filter((deal) => {
    return deal.adjustedPrice <= maxPrice;
  }).length;
  const confidence = confidenceFor(poolSize);
  return {
    matchRate: confidence === 'insufficient' ? null : affordableCount / poolSize,
    poolSize,
    affordableCount,
    unknownCount: pool.unknownCount,
    confidence,
  };
}
