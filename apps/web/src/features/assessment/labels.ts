import {
  FEATURE_LABELS,
  PROPERTY_TYPES,
  type CompromiseDto,
  type Confidence,
  type PropertyType,
} from '@rel/shared';
import { formatPriceShort } from '../../lib/format';

export const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  insufficient: 'אין מספיק נתונים',
  low: 'ביטחון נמוך',
  medium: 'ביטחון בינוני',
  high: 'ביטחון גבוה',
};

/** The card title of a compromise, in plain Hebrew. */
export function compromiseTitle(compromise: CompromiseDto): string {
  const { params } = compromise;
  switch (compromise.type) {
    case 'dropFeature':
      return params.feature === undefined
        ? 'ויתור על דרישה'
        : `לוותר על ${FEATURE_LABELS[params.feature]}`;
    case 'fewerRooms':
      return `${params.rooms ?? ''} חדרים`;
    case 'anyNeighborhood':
      return 'כל השכונות בעיר';
    case 'otherNeighborhood':
      return `שכונת ${params.neighborhood ?? ''}`;
    case 'nearbyCity':
      return `${params.cityName ?? ''}${params.distanceKm === undefined ? '' : ` (${params.distanceKm} ק"מ)`}`;
    case 'raiseBudget':
      return params.newMaxPrice === undefined
        ? 'הגדלת תקציב'
        : `תקציב של ${formatPriceShort(params.newMaxPrice)}`;
  }
}

export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_TYPES[type];
}
