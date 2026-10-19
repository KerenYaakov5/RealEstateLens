import { LATIN_TOKEN_TRANSLATIONS } from '../../data/cities.js';
import { maxSimilarity, similarity } from '../../import/normalizers/levenshtein.js';
import { cleanText, toMatchKey } from '../../import/normalizers/text.js';

export type MatchKind = 'exact' | 'prefix' | 'word' | 'contains' | 'fuzzy';

export interface TextMatch {
  kind: MatchKind;
  score: number;
}

// Hebrew final letters → regular forms, so "רמת גנ" (typed fast) matches "רמת גן".
const FINAL_LETTERS: Readonly<Record<string, string>> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

const SCORES: Readonly<Record<MatchKind, number>> = {
  exact: 100,
  prefix: 80,
  word: 70,
  contains: 50,
  fuzzy: 40,
};

const FUZZY_MIN_LENGTH = 4;
const FUZZY_THRESHOLD = 0.75;

/** Search-only normalization: match key, final letters unified, Latin words translated. */
export function searchKey(text: string): string {
  const key = toMatchKey(cleanText(text) ?? '').replace(/[ךםןףץ]/g, (letter) => {
    return FINAL_LETTERS[letter] ?? letter;
  });
  return key
    .split(' ')
    .map((token) => {
      return LATIN_TOKEN_TRANSLATIONS[token] ?? token;
    })
    .join(' ');
}

/**
 * How well a typed query matches one candidate name (both already passed through searchKey).
 * Partial input matches the start of the name or of any word in it; typos match through edit
 * distance against the same-length start of the name.
 */
export function matchText(query: string, candidate: string): TextMatch | null {
  if (query.length === 0 || candidate.length === 0) {
    return null;
  }
  if (candidate === query) {
    return { kind: 'exact', score: SCORES.exact };
  }
  if (candidate.startsWith(query)) {
    return { kind: 'prefix', score: SCORES.prefix };
  }
  // A later word starts with the query (keys use single spaces, so no split is needed).
  if (candidate.includes(` ${query}`)) {
    return { kind: 'word', score: SCORES.word };
  }
  if (candidate.includes(query)) {
    return { kind: 'contains', score: SCORES.contains };
  }
  if (query.length >= FUZZY_MIN_LENGTH) {
    // Compute an edit distance only where the threshold is still reachable.
    const whole =
      maxSimilarity(query, candidate) >= FUZZY_THRESHOLD ? similarity(query, candidate) : 0;
    const startOfName = candidate.slice(0, query.length);
    const start =
      whole < 1 && maxSimilarity(query, startOfName) >= FUZZY_THRESHOLD
        ? similarity(query, startOfName)
        : 0;
    const best = Math.max(whole, start);
    if (best >= FUZZY_THRESHOLD) {
      return { kind: 'fuzzy', score: SCORES.fuzzy * best };
    }
  }
  return null;
}

/** Best match of a query against several names of the same place. */
export function bestMatch(query: string, candidates: readonly string[]): TextMatch | null {
  let best: TextMatch | null = null;
  for (const candidate of candidates) {
    const match = matchText(query, candidate);
    if (match !== null && (best === null || match.score > best.score)) {
      best = match;
    }
  }
  return best;
}
