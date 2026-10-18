import { parseLooseNumber } from './number.js';
import { cleanText } from './text.js';
import { fail, isBlank, ok, type FieldResult, type RawCell } from './result.js';

const ROOM_WORDS = /(חדרים|חדר|חד'|חד|rooms?)/gi;
const MIN_ROOMS = 1;
const MAX_ROOMS = 12;

/**
 * Rooms as a number in half-room steps. Accepts "3", 3.5, "3,5", "4 חדרים", "חדרים 4", "2.5 rooms".
 */
export function normalizeRooms(raw: RawCell): FieldResult<number> {
  if (isBlank(raw)) {
    return fail('חדרים: שדה חובה חסר');
  }
  let value: number | undefined;
  if (typeof raw === 'number') {
    value = raw;
  } else {
    const text = cleanText(typeof raw === 'string' ? raw : String(raw)) ?? '';
    const numericPart = text
      .replace(ROOM_WORDS, '')
      .trim()
      .replace(/^(\d+),(\d)$/, '$1.$2');
    value = parseLooseNumber(numericPart);
  }
  if (value === undefined) {
    return fail(`חדרים: ערך לא מזוהה "${String(raw)}"`);
  }
  if (value < MIN_ROOMS || value > MAX_ROOMS) {
    return fail(`חדרים: ${value} מחוץ לטווח ${MIN_ROOMS}–${MAX_ROOMS}`);
  }
  if (!Number.isInteger(value * 2)) {
    return fail(`חדרים: ${value} אינו בקפיצות של חצי חדר`);
  }
  return ok(value);
}
