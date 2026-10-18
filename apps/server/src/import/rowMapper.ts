import {
  DEAL_SOURCES,
  PROPERTY_CONDITIONS,
  PROPERTY_TYPES,
  type DealSource,
  type PropertyCondition,
  type PropertyType,
} from '@rel/shared';
import { normalizeBoolean } from './normalizers/boolean.js';
import { normalizeDealDate } from './normalizers/date.js';
import { normalizeEnum } from './normalizers/enum.js';
import type { CityMatcher } from './normalizers/location.js';
import { normalizeNeighborhood, normalizeStreet } from './normalizers/location.js';
import {
  normalizeOptionalInt,
  normalizePrice,
  normalizeRequiredInt,
  parseLooseNumber,
} from './normalizers/number.js';
import { normalizeRooms } from './normalizers/rooms.js';
import { cleanText } from './normalizers/text.js';
import type { FieldResult, RawCell } from './normalizers/result.js';

export type RawRow = Readonly<Record<string, RawCell>>;

export interface NormalizedDeal {
  dealId: string;
  rowNumber: number;
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
  hasElevator: boolean | null;
  hasParking: boolean | null;
  hasBalcony: boolean | null;
  hasSafeRoom: boolean | null;
  dealDate: string | null;
  priceNis: number;
  /** Always recomputed from price / size; the spreadsheet value is kept only for auditing. */
  pricePerSqm: number | null;
  sourcePricePerSqm: number | null;
  source: DealSource;
}

export type RowOutcome =
  | { ok: true; deal: NormalizedDeal; warnings: string[] }
  | { ok: false; rowNumber: number; dealId: string | null; errors: string[]; warnings: string[] };

const PRICE_PER_SQM_TOLERANCE = 0.02;

/** Collects every field result so a bad row reports all of its problems at once. */
class RowCollector {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  take<T>(result: FieldResult<T>): T | undefined {
    if (!result.ok) {
      this.errors.push(result.reason);
      return undefined;
    }
    if (result.warning !== undefined) {
      this.warnings.push(result.warning);
    }
    return result.value;
  }
}

export function mapRow(
  raw: RawRow,
  rowNumber: number,
  cities: CityMatcher,
  today: Date,
): RowOutcome {
  const row = new RowCollector();
  const currentYear = today.getUTCFullYear();

  const dealId = cleanText(raw.deal_id);
  if (dealId === null) {
    row.errors.push('מזהה עסקה: שדה חובה חסר');
  }
  const city = row.take(cities.match(raw.city));
  const neighborhood = row.take(normalizeNeighborhood(raw.neighborhood));
  const street = row.take(normalizeStreet(raw.street));
  const propertyType = row.take(
    normalizeEnum(PROPERTY_TYPES, raw.property_type, 'סוג נכס', { required: true }),
  );
  const rooms = row.take(normalizeRooms(raw.rooms));
  const sizeSqm = row.take(
    normalizeOptionalInt(raw.size_sqm, { min: 10, max: 1000, label: 'גודל' }),
  );
  const totalFloors = row.take(
    normalizeRequiredInt(raw.total_floors, { min: 1, max: 100, label: 'קומות בבניין' }),
  );
  let floor = row.take(normalizeOptionalInt(raw.floor, { min: -3, max: 100, label: 'קומה' }));
  const yearBuilt = row.take(
    normalizeOptionalInt(raw.year_built, { min: 1900, max: currentYear + 5, label: 'שנת בנייה' }),
  );
  const condition = row.take(
    normalizeEnum(PROPERTY_CONDITIONS, raw.condition, 'מצב הנכס', { required: false }),
  );
  const hasElevator = row.take(normalizeBoolean(raw.has_elevator));
  const hasParking = row.take(normalizeBoolean(raw.has_parking));
  const hasBalcony = row.take(normalizeBoolean(raw.has_balcony));
  const hasSafeRoom = row.take(normalizeBoolean(raw.has_safe_room));
  const dealDate = row.take(normalizeDealDate(raw.deal_date, today));
  const priceNis = row.take(normalizePrice(raw.price_nis));
  const source = row.take(
    normalizeEnum(DEAL_SOURCES, raw.source, 'מקור המידע', { required: true }),
  );

  if (floor !== undefined && floor !== null && totalFloors !== undefined && floor > totalFloors) {
    row.warnings.push(`קומה ${floor} גבוהה ממספר הקומות ${totalFloors} – נשמרה כחסרה`);
    floor = null;
  }

  const pricePerSqm =
    priceNis !== undefined && sizeSqm !== undefined && sizeSqm !== null
      ? Math.round(priceNis / sizeSqm)
      : null;
  const sourcePricePerSqm = parseLooseNumber(raw.price_per_sqm) ?? null;
  if (sourcePricePerSqm !== null && pricePerSqm !== null) {
    const gap = Math.abs(sourcePricePerSqm - pricePerSqm) / pricePerSqm;
    if (gap > PRICE_PER_SQM_TOLERANCE) {
      row.warnings.push(
        `מחיר למ"ר בקובץ (${sourcePricePerSqm}) שונה מהמחושב (${pricePerSqm}) – נעשה שימוש במחושב`,
      );
    }
  }

  if (
    row.errors.length > 0 ||
    dealId === null ||
    city === undefined ||
    neighborhood === undefined ||
    street === undefined ||
    propertyType === undefined ||
    propertyType === null ||
    rooms === undefined ||
    sizeSqm === undefined ||
    totalFloors === undefined ||
    floor === undefined ||
    yearBuilt === undefined ||
    condition === undefined ||
    hasElevator === undefined ||
    hasParking === undefined ||
    hasBalcony === undefined ||
    hasSafeRoom === undefined ||
    dealDate === undefined ||
    priceNis === undefined ||
    source === undefined ||
    source === null
  ) {
    return { ok: false, rowNumber, dealId, errors: row.errors, warnings: row.warnings };
  }

  return {
    ok: true,
    warnings: row.warnings,
    deal: {
      dealId,
      rowNumber,
      cityKey: city.cityKey,
      neighborhood,
      street,
      propertyType,
      rooms,
      sizeSqm,
      floor,
      totalFloors,
      yearBuilt,
      condition,
      hasElevator,
      hasParking,
      hasBalcony,
      hasSafeRoom,
      dealDate,
      priceNis,
      pricePerSqm,
      sourcePricePerSqm,
      source,
    },
  };
}
