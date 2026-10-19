import type { DealSource, Feature, PropertyCondition, PropertyType } from '@rel/shared';
import type { ItmPoint } from '../geo/itm.js';

/** A deal as held in memory by the assessment engine. */
export interface SnapshotDeal {
  /** Database id (exposed in the API). */
  id: number;
  /** Identifier from the source file, e.g. "D100350". */
  dealId: string;
  cityKey: string;
  neighborhood: string | null;
  street: string;
  propertyType: PropertyType;
  rooms: number;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number;
  yearBuilt: number | null;
  condition: PropertyCondition | null;
  features: Readonly<Record<Feature, boolean | null>>;
  /** ISO YYYY-MM-DD, or null when the source had no valid date. */
  dealDate: string | null;
  priceNis: number;
  source: DealSource;
}

export interface SnapshotCity {
  /** Database id (exposed in the API); the engine works with `key`. */
  id: number;
  key: string;
  nameHe: string;
  nameEn: string | null;
  /** CBS municipal status code (0 city, 99 local council) – ranks search suggestions. */
  municipalStatus: number | null;
  population: number | null;
  /** Official coordinates (CBS), or null – a city without them is never "nearby". */
  location: ItmPoint | null;
}

export interface SnapshotNeighborhood {
  id: number;
  cityKey: string;
  name: string;
}

/** The one way to key a neighborhood by city and name in memory. */
export function neighborhoodKey(cityKey: string, name: string): string {
  return `${cityKey}|${name}`;
}

export interface IndexPointInput {
  /** YYYY-MM-01 */
  period: string;
  value: number;
}

/** A deal with its price expressed in today's terms where the CBS index allows it. */
export interface PricedDeal extends SnapshotDeal {
  adjustedPrice: number;
  /** False when the deal has no date or its month is not covered by the index. */
  isAdjusted: boolean;
}
