import type { RawCell } from './result.js';

const NIQQUD_AND_CANTILLATION = /[\u0591-\u05C7]/g;
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const DOUBLE_QUOTES = /[\u05F4\u201C\u201D\u201E\u00AB\u00BB]/g; // ״ “ ” „ « »
const SINGLE_QUOTES = /[\u05F3\u2018\u2019\u201B`\u00B4]/g; // ׳ ‘ ’ ‛ ` ´
const DASHES = /[\u2010-\u2015\u2212\u05BE]/g; // ‐ ‑ ‒ – — ― − ־(maqaf)
const WHITESPACE = /[\s\u00A0]+/g;

/**
 * Cleans a free-text cell for storage: Unicode-normalizes, removes niqqud and invisible
 * characters, unifies quote and dash variants, collapses whitespace and trims.
 * Returns null for empty input.
 */
export function cleanText(raw: RawCell): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw)
    .normalize('NFKC')
    .replace(NIQQUD_AND_CANTILLATION, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(DASHES, '-')
    .replace(WHITESPACE, ' ')
    .trim();
  if (text === '') {
    return null;
  }
  return text;
}

/**
 * Builds a comparison key from already-cleaned text: lowercase Latin, no quotes,
 * hyphens and dots treated as spaces. Two spellings of the same name share a key
 * ("תל אביב-יפו" / "תל אביב יפו", "Tel-Aviv" / "tel aviv").
 */
export function toMatchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[-.,_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
