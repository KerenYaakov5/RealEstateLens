import { cleanText } from './text.js';
import { fail, isBlank, ok, type FieldResult, type RawCell } from './result.js';

// Currency markers and thousands separators that may surround a number.
const CURRENCY_NOISE = /(₪|ש"ח|שח|ש''ח|nis|ils)/gi;

/**
 * Extracts a plain number from a cell: accepts numbers, and strings with thousands
 * separators, currency signs and surrounding spaces ("1,850,000 ₪", "ש"ח 950000").
 * Returns undefined when the cell does not hold exactly one number.
 */
export function parseLooseNumber(raw: RawCell): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  const text = cleanText(raw);
  if (text === null) {
    return undefined;
  }
  const stripped = text.replace(CURRENCY_NOISE, '').replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) {
    return undefined;
  }
  return Number(stripped);
}

interface IntegerRange {
  min: number;
  max: number;
  label: string;
}

/** Optional integer within a range. Empty → null; out of range / unparseable → null + warning. */
export function normalizeOptionalInt(
  raw: RawCell,
  range: IntegerRange,
): FieldResult<number | null> {
  if (isBlank(raw)) {
    return ok(null);
  }
  const value = parseLooseNumber(raw);
  if (value === undefined || !Number.isInteger(value)) {
    return ok(null, `${range.label}: ערך לא מספרי "${String(raw)}" – נשמר כחסר`);
  }
  if (value < range.min || value > range.max) {
    return ok(null, `${range.label}: ${value} מחוץ לטווח ${range.min}–${range.max} – נשמר כחסר`);
  }
  return ok(value);
}

/** Mandatory integer within a range. */
export function normalizeRequiredInt(raw: RawCell, range: IntegerRange): FieldResult<number> {
  if (isBlank(raw)) {
    return fail(`${range.label}: שדה חובה חסר`);
  }
  const value = parseLooseNumber(raw);
  if (value === undefined || !Number.isInteger(value)) {
    return fail(`${range.label}: ערך לא מספרי "${String(raw)}"`);
  }
  if (value < range.min || value > range.max) {
    return fail(`${range.label}: ${value} מחוץ לטווח ${range.min}–${range.max}`);
  }
  return ok(value);
}

export const PRICE_RANGE = { min: 100_000, max: 100_000_000 } as const;

/** Deal price in NIS – mandatory, positive and within a sane range. */
export function normalizePrice(raw: RawCell): FieldResult<number> {
  if (isBlank(raw)) {
    return fail('מחיר: שדה חובה חסר');
  }
  const value = parseLooseNumber(raw);
  if (value === undefined) {
    return fail(`מחיר: ערך לא מספרי "${String(raw)}"`);
  }
  if (value < PRICE_RANGE.min || value > PRICE_RANGE.max) {
    return fail(`מחיר: ${value} מחוץ לטווח הסביר`);
  }
  return ok(Math.round(value));
}
