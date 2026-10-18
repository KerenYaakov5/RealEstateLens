import { LATIN_TOKEN_TRANSLATIONS, type CityReference } from '../../data/cities.js';
import { similarity } from './levenshtein.js';
import { cleanText, toMatchKey } from './text.js';
import { fail, isBlank, ok, type FieldResult, type RawCell } from './result.js';

export type CityMatchMethod = 'exact' | 'translated' | 'fuzzy';

export interface CityMatch {
  cityKey: string;
  method: CityMatchMethod;
}

const FUZZY_THRESHOLD = 0.8;
const FUZZY_MIN_LENGTH = 4;

/**
 * Resolves raw city names to a known city. Order: exact name/alias → per-token
 * Latin→Hebrew translation (mixed spellings) → fuzzy match above a threshold.
 */
export class CityMatcher {
  private readonly byKey = new Map<string, string>();

  constructor(cities: readonly CityReference[]) {
    for (const city of cities) {
      for (const name of [city.nameHe, city.nameEn, ...city.aliases]) {
        const cleaned = cleanText(name);
        if (cleaned !== null) {
          this.byKey.set(toMatchKey(cleaned), city.key);
        }
      }
    }
  }

  match(raw: RawCell): FieldResult<CityMatch> {
    if (isBlank(raw)) {
      return fail('עיר: שדה חובה חסר');
    }
    const cleaned = cleanText(raw) ?? '';
    const key = toMatchKey(cleaned);

    const exact = this.byKey.get(key);
    if (exact !== undefined) {
      return ok({ cityKey: exact, method: 'exact' });
    }

    const translatedKey = translateLatinTokens(key);
    const translated = this.byKey.get(translatedKey);
    if (translated !== undefined) {
      return ok(
        { cityKey: translated, method: 'translated' },
        `עיר "${cleaned}" זוהתה בתרגום מילים`,
      );
    }

    const fuzzy = this.bestFuzzyMatch(translatedKey);
    if (fuzzy !== undefined) {
      return ok({ cityKey: fuzzy, method: 'fuzzy' }, `עיר "${cleaned}" זוהתה בהתאמה עמומה`);
    }

    return fail(`עיר לא מוכרת: "${cleaned}"`);
  }

  private bestFuzzyMatch(key: string): string | undefined {
    if (key.length < FUZZY_MIN_LENGTH) {
      return undefined;
    }
    let best: { cityKey: string; score: number } | undefined;
    for (const [candidate, cityKey] of this.byKey) {
      const score = similarity(key, candidate);
      if (score >= FUZZY_THRESHOLD && (best === undefined || score > best.score)) {
        best = { cityKey, score };
      }
    }
    return best?.cityKey;
  }
}

function translateLatinTokens(key: string): string {
  return key
    .split(' ')
    .map((token) => {
      return LATIN_TOKEN_TRANSLATIONS[token] ?? token;
    })
    .join(' ');
}

/** Neighborhood spellings that cleaning alone cannot unify, keyed by match key. */
const NEIGHBORHOOD_ALIASES: Readonly<Record<string, string>> = {
  florentin: 'פלורנטין',
  'רמבש א': "רמת בית שמש א'",
  'רמבש ב': "רמת בית שמש ב'",
  'רמבש ג': "רמת בית שמש ג'",
  'רמבש ד': "רמת בית שמש ד'",
};

// A trailing single Hebrew letter is a section marker ("רמת בית שמש ג") and gets a geresh.
const TRAILING_SECTION_LETTER = /(\s)([א-ת])$/;

/** Neighborhood is optional: empty → null. Returns a canonical display name. */
export function normalizeNeighborhood(raw: RawCell): FieldResult<string | null> {
  if (isBlank(raw)) {
    return ok(null);
  }
  const cleaned = cleanText(raw);
  if (cleaned === null) {
    return ok(null);
  }
  const alias = NEIGHBORHOOD_ALIASES[toMatchKey(cleaned)];
  if (alias !== undefined) {
    return ok(alias);
  }
  return ok(cleaned.replace(TRAILING_SECTION_LETTER, "$1$2'"));
}

/** Street is mandatory free text. */
export function normalizeStreet(raw: RawCell): FieldResult<string> {
  const cleaned = cleanText(raw);
  if (cleaned === null) {
    return fail('רחוב: שדה חובה חסר');
  }
  return ok(cleaned);
}
