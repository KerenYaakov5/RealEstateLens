import { cleanText } from './text.js';
import { isBlank, ok, type FieldResult, type RawCell } from './result.js';

// Excel stores dates as days since 1899-12-30 (accounting for its 1900 leap-year bug).
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
const MIN_YEAR = 1990;

const DAY_FIRST = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/; // 17.07.2026, 17/7/2026, 17-07-2026
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/; // 2026-07-17, 2026-07-17T00:00:00Z
const DAY_MONTH_ONLY = /^(\d{1,2})[./-](\d{1,2})$/; // 17.07 – no year

function toIsoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

function fromExcelSerial(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 1) {
    return undefined;
  }
  const date = new Date(EXCEL_EPOCH_UTC + Math.round(serial) * MS_PER_DAY);
  return date.toISOString().slice(0, 10);
}

function parse(raw: RawCell): string | undefined {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return undefined;
    }
    return toIsoDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === 'number') {
    return fromExcelSerial(raw);
  }
  const text = cleanText(raw) ?? '';
  if (/^\d+(\.\d+)?$/.test(text)) {
    return fromExcelSerial(Number(text));
  }
  const dayFirst = DAY_FIRST.exec(text);
  if (dayFirst !== null) {
    return toIsoDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  }
  const iso = ISO.exec(text);
  if (iso !== null) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  return undefined;
}

/**
 * Deal date as ISO "YYYY-MM-DD". Never fails the row: a missing year, an impossible
 * date or a date in the future all become null (+ warning), as agreed for this data.
 */
export function normalizeDealDate(
  raw: RawCell,
  today: Date = new Date(),
): FieldResult<string | null> {
  if (isBlank(raw)) {
    return ok(null);
  }
  const text = typeof raw === 'string' ? (cleanText(raw) ?? '') : '';
  if (DAY_MONTH_ONLY.test(text)) {
    return ok(null, `תאריך ללא שנה "${text}" – נשמר כחסר`);
  }
  const iso = parse(raw);
  if (iso === undefined) {
    return ok(null, `תאריך לא תקין "${String(raw)}" – נשמר כחסר`);
  }
  const year = Number(iso.slice(0, 4));
  if (year < MIN_YEAR) {
    return ok(null, `תאריך ${iso} מוקדם מדי – נשמר כחסר`);
  }
  if (iso > today.toISOString().slice(0, 10)) {
    return ok(null, `תאריך ${iso} בעתיד – נשמר כחסר`);
  }
  return ok(iso);
}
