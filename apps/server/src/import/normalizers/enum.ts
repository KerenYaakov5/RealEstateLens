import { cleanText, toMatchKey } from './text.js';
import { fail, isBlank, ok, type FieldResult, type RawCell } from './result.js';

/**
 * Maps a raw label to an enum key. Matches the Hebrew label or the English key,
 * ignoring whitespace, case, quotes and hyphens.
 */
export function normalizeEnum<T extends Record<string, string>>(
  record: T,
  raw: RawCell,
  label: string,
  options: { required: boolean },
): FieldResult<(keyof T & string) | null> {
  if (isBlank(raw)) {
    if (options.required) {
      return fail(`${label}: שדה חובה חסר`);
    }
    return ok(null);
  }
  const text = cleanText(typeof raw === 'string' ? raw : String(raw)) ?? '';
  const key = toMatchKey(text);
  for (const [enumKey, hebrewLabel] of Object.entries(record)) {
    if (toMatchKey(hebrewLabel) === key || enumKey.toLowerCase() === key.replace(/ /g, '')) {
      return ok(enumKey as keyof T & string);
    }
  }
  if (options.required) {
    return fail(`${label}: ערך לא מוכר "${text}"`);
  }
  return ok(null, `${label}: ערך לא מוכר "${text}" – נשמר כחסר`);
}
