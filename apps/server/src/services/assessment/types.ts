import type { DealSource, Feature, PropertyCondition, PropertyType } from '@rel/shared';
import type { ItmPoint } from '../geo/itm.js';

/** A deal as held in memory by the assessment engine. */
export interface SnapshotDeal {
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
  key: string;
  nameHe: string;
  /** Official coordinates (CBS), or null – a city without them is never "nearby". */
  location: ItmPoint | null;
}

export interface IndexPointInput {
  /** YYYY-MM-01 */
  period: string;
  value: number;
}

export interface MarketSnapshot {
  deals: readonly SnapshotDeal[];
  cities: ReadonlyMap<string, SnapshotCity>;
  priceIndex: readonly IndexPointInput[];
}

/** A deal with its price expressed in today's terms where the CBS index allows it. */
export interface PricedDeal extends SnapshotDeal {
  adjustedPrice: number;
  /** False when the deal has no date or its month is not covered by the index. */
  isAdjusted: boolean;
}
